/**
 * Stage 2 of AI Email Parsing: Processes specifically marked "relevant" emails by using an LLM to accurately extract structured field updates (status, salary, etc.) and logs them to the application timeline.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/api-auth";
import { getMessage, getValidGoogleToken } from "@/lib/gmail";
import { parseConfidenceNum } from "@/types/applications";
import { parseEmailBody } from "@/lib/llm-parser";
import type { ParsedEmailUpdate } from "@/lib/llm-parser";

import { recalculateApplication, buildFieldEvents } from "@/lib/applications";

interface ProcessRequestBody {
  emails: {
    messageId: string;
    application_id: number;
    company_name: string;
    job_title: string;
  }[];
}

interface ScanUpdate {
  application_id: number;
  email_subject: string;
  fields_updated: string[];
  confidence: string;
}

export async function POST(request: NextRequest) {
  let body: ProcessRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { emails: selectedEmails } = body;
  if (!selectedEmails || !Array.isArray(selectedEmails)) {
    return NextResponse.json(
      { error: "emails array is required" },
      { status: 400 },
    );
  }

  // Ensure selectedEmails is deduplicated just in case the UI sent the same email twice
  const uniqueEmailsMap = new Map();
  for (const e of selectedEmails) {
    const key = `${e.messageId}-${e.application_id}`;
    if (!uniqueEmailsMap.has(key)) {
      uniqueEmailsMap.set(key, e);
    }
  }
  const deduplicatedSelectedEmails = Array.from(uniqueEmailsMap.values());

  if (deduplicatedSelectedEmails.length === 0) {
    return NextResponse.json({ processed: 0, updates: [] });
  }

  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;
  const { user, admin } = auth;

  let accessToken: string;
  try {
    accessToken = await getValidGoogleToken(admin, user.id);
  } catch (err: any) {
    if (err.message === "NO_TOKEN") {
      return NextResponse.json(
        { error: "No Google token found.", code: "NO_TOKEN" },
        { status: 401 },
      );
    }
    return NextResponse.json(
      {
        error: "Google token expired. Please log out and log in again with Google.",
        code: "TOKEN_EXPIRED",
      },
      { status: 401 },
    );
  }

  // Fetch the current application statuses for parsing context
  const appIds = deduplicatedSelectedEmails.map(e => e.application_id);
  const { data: apps } = await admin
    .from("application_current")
    .select("application_id, status, contact_person")
    .in("application_id", appIds);

  const appDataList = new Map(apps?.map(a => [a.application_id, { status: a.status, contact_person: a.contact_person }]) ?? []);
  const updates: ScanUpdate[] = [];
  const processedAppIds = new Set<number>();

  for (const selected of deduplicatedSelectedEmails) {
    try {
      const message = await getMessage(accessToken, selected.messageId);
      const appData = appDataList.get(selected.application_id) || { status: "applied", contact_person: null };

      const parsed = await parseEmailBody(
        message.subject,
        message.from,
        message.body,
        {
          company_name: selected.company_name,
          job_title: selected.job_title,
          status: appData.status,
          contact_person: appData.contact_person as string | null,
        },
      );

      console.log(`[Process] Parsed output for msg ${selected.messageId}:`, parsed);
      console.log(`[Process] Message body length:`, message.body.length);

      let emailReceivedAt;
      try {
        emailReceivedAt = new Date(message.date).toISOString();
      } catch (dateErr) {
        console.warn(`[Process] Invalid date from Gmail: ${message.date}. Using current time.`);
        emailReceivedAt = new Date().toISOString();
      }

      let emailId: number;

      // Check if email already exists
      const { data: existingEmail } = await admin
        .from("emails")
        .select("id")
        .eq("provider", "gmail")
        .eq("provider_message_id", message.messageId)
        .single();

      if (existingEmail) {
        emailId = existingEmail.id;
      } else {
        const { data: emailRow, error: emailErr } = await admin
          .from("emails")
          .insert({
            user_id: user.id,
            provider: "gmail",
            provider_message_id: message.messageId,
            from_email: message.from,
            subject: message.subject,
            body: message.body.slice(0, 10000),
            received_at: emailReceivedAt,
          })
          .select("id")
          .single();

        if (emailErr || !emailRow) {
          console.error(`[Process] Failed to insert email into DB:`, emailErr);
          continue;
        }
        emailId = emailRow.id;
      }

      const confidenceNum = parseConfidenceNum(parsed.confidence);

      await admin.from("application_email_links").insert({
        application_id: selected.application_id,
        email_id: emailId,
        source: "ai",
        confidence: confidenceNum,
        is_active: true,
      });

      const fieldEvents = buildFieldEvents(
        selected.application_id,
        emailId,
        parsed,
        emailReceivedAt,
      );

      if (fieldEvents.length > 0) {
        await admin.from("application_field_events").insert(fieldEvents);
      }

      processedAppIds.add(selected.application_id);

      updates.push({
        application_id: selected.application_id,
        email_subject: message.subject,
        fields_updated: fieldEvents.map((e) => e.field_name as string),
        confidence: parsed.confidence,
      });

    } catch (err) {
      console.error(`Error processing email ${selected.messageId}:`, err);
    }
  }

  // Bulk Recalculation Phase
  for (const appId of processedAppIds) {
    // Filter out active flags
    const { data: inactiveLinks } = await admin
      .from("application_email_links")
      .select("email_id")
      .eq("application_id", appId)
      .eq("is_active", false);

    const inactiveEmailIds = new Set((inactiveLinks ?? []).map(l => l.email_id));

    await recalculateApplication(admin, appId, inactiveEmailIds);
  }

  return NextResponse.json({
    processed: updates.length,
    updates,
  });
}
