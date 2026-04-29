/**
 * Stage 1 of AI Email Parsing: Scans the user's connected Gmail inbox for recent emails and uses a fast LLM batch check to detect their relevance against tracked job applications.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/api-auth";
import { fetchGmailMessages, requireGoogleToken } from "@/lib/gmail";
import { checkRelevanceBatch } from "@/lib/llm-parser";

interface ScanRequestBody {
  start_date: string;
  end_date: string;
}

export interface RelevantEmailResult {
  messageId: string;
  subject: string;
  sender: string;
  application_id: number;
  company_name: string;
  job_title: string;
  confidence: string;
  body: string;
}

function isObviouslyIrrelevant(subject: string, sender: string): boolean {
  const s = subject.toLowerCase();
  const f = sender.toLowerCase();

  // 1. Marketing / Newsletter Blacklist
  if (/newsletter|marketing|promotions|promotion|noreply|no-reply|digest|roundup/i.test(f)) return true;
  if (/substack\.com|medium\.com|patreon\.com/i.test(f)) return true;
  if (/(weekly|monthly|daily)\s+(digest|roundup|update)/i.test(s)) return true;
  if (/\b(sale|discount|% off|save \d+%)\b/i.test(s)) return true;

  // 2. Automated System Blacklists
  if (/(security alert|new sign-in|password reset|verify your email|verification code|receipt from)/i.test(s)) return true;

  return false;
}

export async function POST(request: NextRequest) {
  let body: ScanRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { start_date, end_date } = body;
  if (!start_date || !end_date) {
    return NextResponse.json(
      { error: "start_date and end_date are required" },
      { status: 400 },
    );
  }

  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;
  const { user, admin } = auth;

  // 1. Get user's Google token (with preemptive refresh)
  const tokenResult = await requireGoogleToken(admin, user.id);
  if (tokenResult.errorResponse) return tokenResult.errorResponse;
  const accessToken = tokenResult.accessToken;

  // 2. Fetch Gmail messages
  let gmailMessages;
  try {
    gmailMessages = await fetchGmailMessages(
      accessToken,
      start_date,
      end_date,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("401") || message.includes("Invalid Credentials")) {
      return NextResponse.json(
        {
          error: "Google token expired. Please log out and log in again with Google.",
          code: "TOKEN_EXPIRED",
        },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: `Gmail fetch failed: ${message}` },
      { status: 500 },
    );
  }

  // 3. Get user's tracked applications for relevance matching
  const { data: appIds } = await admin
    .from("applications")
    .select("id")
    .eq("user_id", user.id);

  const ids = (appIds ?? []).map((r) => r.id);

  let applications: { id: number; application_id: number; company_name: string; job_title: string; status: string }[] = [];
  if (ids.length > 0) {
    const { data: apps } = await admin
      .from("application_current")
      .select("id, application_id, company_name, job_title, status")
      .in("application_id", ids);
    applications = (apps ?? []) as typeof applications;
  }

  // 4. Check for already-processed emails to avoid duplicates
  const { data: existingEmails } = await admin
    .from("emails")
    .select("provider_message_id")
    .eq("provider", "gmail");

  const processedIds = new Set(
    (existingEmails ?? []).map((e) => e.provider_message_id),
  );

  // 5. Batched Relevance Check
  const relevantEmails: RelevantEmailResult[] = [];
  const uniqueNewEmailsMap = new Map();
  for (const m of gmailMessages) {
    if (
      !processedIds.has(m.messageId) &&
      !uniqueNewEmailsMap.has(m.messageId) &&
      !isObviouslyIrrelevant(m.subject, m.from)
    ) {
      uniqueNewEmailsMap.set(m.messageId, m);
    }
  }
  const newEmails = Array.from(uniqueNewEmailsMap.values());

  const BATCH_SIZE = 25;
  const CONCURRENCY_LIMIT = 4; // 4 should be safe with expanded quotas
  const batches = [];

  for (let i = 0; i < newEmails.length; i += BATCH_SIZE) {
    batches.push(newEmails.slice(i, i + BATCH_SIZE));
  }

  for (let i = 0; i < batches.length; i += CONCURRENCY_LIMIT) {
    const chunk = batches.slice(i, i + CONCURRENCY_LIMIT);

    const chunkResults = await Promise.all(
      chunk.map(async (batch) => {
        const relevanceResults = await checkRelevanceBatch(
          batch.map(m => ({ messageId: m.messageId, subject: m.subject, sender: m.from, snippet: m.body.slice(0, 150) })),
          applications.map((a) => ({
            application_id: a.application_id,
            company_name: a.company_name,
            job_title: a.job_title,
          }))
        );
        return { batch, relevanceResults };
      })
    );

    for (const { batch, relevanceResults } of chunkResults) {
      for (const relevance of relevanceResults) {
        if (!relevance.relevant) continue;

        const message = batch.find(m => m.messageId === relevance.messageId);
        if (!message) continue;

        const matchedApp = relevance.matched_application_id
          ? applications.find((a) => a.application_id === relevance.matched_application_id)
          : null;

        if (!matchedApp) continue;

        relevantEmails.push({
          messageId: message.messageId,
          subject: message.subject,
          sender: message.from,
          application_id: matchedApp.application_id,
          company_name: matchedApp.company_name,
          job_title: matchedApp.job_title,
          confidence: relevance.confidence,
          body: message.body,
        });
      }
    }
  }

  return NextResponse.json({
    scanned: gmailMessages.length,
    new_emails: newEmails.length,
    skipped_duplicates: gmailMessages.length - newEmails.length,
    relevant: relevantEmails.length,
    relevant_emails: relevantEmails,
  });
}
