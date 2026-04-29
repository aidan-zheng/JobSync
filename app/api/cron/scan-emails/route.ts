/**
 * Automated daily Gmail scanner cron job endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidGoogleToken } from "@/lib/gmail";
import { fetchGmailMessages, getMessage } from "@/lib/gmail";
import { checkRelevanceBatch, parseEmailBody } from "@/lib/llm-parser";
import { parseConfidenceNum } from "@/types/applications";
import { recalculateApplication, buildFieldEvents } from "@/lib/applications";

/**
 * Verify requests originate from the trusted scheduler via CRON_SECRET.
 */
function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // if no secret is configured, block all requests in production.
    console.error("[cron] CRON_SECRET is not set – rejecting request");
    return false;
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  return token === cronSecret;
}

/**
 * Filter obviously irrelevant emails based on subject lines or known senders.
 */
function isObviouslyIrrelevant(subject: string, sender: string): boolean {
  const s = subject.toLowerCase();
  const f = sender.toLowerCase();
  if (/newsletter|marketing|promotions|promotion|noreply|no-reply|digest|roundup/i.test(f)) return true;
  if (/substack\.com|medium\.com|patreon\.com/i.test(f)) return true;
  if (/(weekly|monthly|daily)\s+(digest|roundup|update)/i.test(s)) return true;
  if (/\b(sale|discount|% off|save \d+%)\b/i.test(s)) return true;
  if (/(security alert|new sign-in|password reset|verify your email|verification code|receipt from)/i.test(s)) return true;
  return false;
}

/**
 * Scan Gmail for a user and trigger automated LLM evaluations.
 */
async function scanForUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  scanWindowStart: string | null,
  lastScanTime: string | null,
) {
  const now = new Date();

  // Determine start of scan window
  let startDate: string;
  if (lastScanTime) {
    const d = new Date(lastScanTime);
    d.setMinutes(d.getMinutes() - 1);
    startDate = d.toISOString().slice(0, 10);
  } else if (scanWindowStart) {
    startDate = scanWindowStart;
  } else {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    startDate = d.toISOString().slice(0, 10);
  }
  const endDate = now.toISOString().slice(0, 10);

  console.log(`[cron] Scanning user ${userId} from ${startDate} to ${endDate}`);

  // 1. Get a valid access token (auto-refresh if needed)
  let accessToken: string;
  try {
    accessToken = await getValidGoogleToken(admin, userId);
  } catch (err: any) {
    console.error(`[cron] Token error for user ${userId}:`, err.message);
    return { userId, error: err.message };
  }

  // 2. Fetch Gmail messages
  let gmailMessages;
  try {
    gmailMessages = await fetchGmailMessages(accessToken, startDate, endDate);
  } catch (err: any) {
    console.error(`[cron] Gmail fetch error for user ${userId}:`, err.message);
    return { userId, error: err.message };
  }

  // 3. Load user's tracked applications
  const { data: appIds } = await admin
    .from("applications")
    .select("id")
    .eq("user_id", userId);

  const ids = (appIds ?? []).map((r) => r.id);
  let applications: { id: number; application_id: number; company_name: string; job_title: string; status: string }[] = [];
  if (ids.length > 0) {
    const { data: apps } = await admin
      .from("application_current")
      .select("id, application_id, company_name, job_title, status")
      .in("application_id", ids);
    applications = (apps ?? []) as typeof applications;
  }

  if (applications.length === 0) {
    console.log(`[cron] No applications for user ${userId}, skipping`);
    return { userId, scanned: 0, processed: 0 };
  }

  // 4. Filter already-processed emails
  const { data: existingEmails } = await admin
    .from("emails")
    .select("provider_message_id")
    .eq("provider", "gmail");

  const processedIds = new Set((existingEmails ?? []).map((e) => e.provider_message_id));

  const newEmails = gmailMessages.filter(
    (m) =>
      !processedIds.has(m.messageId) &&
      !isObviouslyIrrelevant(m.subject, m.from),
  );

  if (newEmails.length === 0) {
    console.log(`[cron] No new emails for user ${userId}`);
    return { userId, scanned: gmailMessages.length, processed: 0 };
  }

  // 5. Stage 1 — batch relevance check, keep only HIGH confidence
  const BATCH_SIZE = 25;
  const CONCURRENCY = 3;
  const batches: typeof newEmails[] = [];
  for (let i = 0; i < newEmails.length; i += BATCH_SIZE) {
    batches.push(newEmails.slice(i, i + BATCH_SIZE));
  }

  const highConfidenceEmails: {
    messageId: string;
    subject: string;
    from: string;
    body: string;
    application_id: number;
    company_name: string;
    job_title: string;
  }[] = [];

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (batch) => {
        const relevanceResults = await checkRelevanceBatch(
          batch.map((m) => ({
            messageId: m.messageId,
            subject: m.subject,
            sender: m.from,
            snippet: m.body.slice(0, 150),
          })),
          applications.map((a) => ({
            application_id: a.application_id,
            company_name: a.company_name,
            job_title: a.job_title,
          })),
        );
        return { batch, relevanceResults };
      }),
    );

    for (const { batch, relevanceResults } of results) {
      for (const rel of relevanceResults) {
        // high only b/c automated scans
        if (!rel.relevant || rel.confidence !== "high") continue;

        const msg = batch.find((m) => m.messageId === rel.messageId);
        if (!msg) continue;

        const matchedApp = rel.matched_application_id
          ? applications.find((a) => a.application_id === rel.matched_application_id)
          : null;
        if (!matchedApp) continue;

        highConfidenceEmails.push({
          messageId: msg.messageId,
          subject: msg.subject,
          from: msg.from,
          body: msg.body,
          application_id: matchedApp.application_id,
          company_name: matchedApp.company_name,
          job_title: matchedApp.job_title,
        });
      }
    }
  }

  console.log(`[cron] User ${userId}: ${newEmails.length} new → ${highConfidenceEmails.length} high-confidence`);

  if (highConfidenceEmails.length === 0) {
    return { userId, scanned: gmailMessages.length, processed: 0 };
  }

  // 6. Stage 2 — body parsing
  const appDataMap = new Map(
    applications.map((a) => [a.application_id, { status: a.status, contact_person: null as string | null }]),
  );

  // Fetch current contact_person for each matched application
  const matchedAppIds = [...new Set(highConfidenceEmails.map((e) => e.application_id))];
  const { data: currentApps } = await admin
    .from("application_current")
    .select("application_id, status, contact_person")
    .in("application_id", matchedAppIds);
  for (const a of currentApps ?? []) {
    appDataMap.set(a.application_id, { status: a.status, contact_person: a.contact_person });
  }

  const processedAppIds = new Set<number>();
  let processedCount = 0;

  const CONCURRENCY_STAGE2 = 4;
  for (let i = 0; i < highConfidenceEmails.length; i += CONCURRENCY_STAGE2) {
    const chunk = highConfidenceEmails.slice(i, i + CONCURRENCY_STAGE2);
    await Promise.all(
      chunk.map(async (selected) => {
        try {
          const message = await getMessage(accessToken, selected.messageId);
          const appData = appDataMap.get(selected.application_id) ?? { status: "applied", contact_person: null };

          const parsed = await parseEmailBody(
            message.subject,
            message.from,
            message.body,
            {
              company_name: selected.company_name,
              job_title: selected.job_title,
              status: appData.status,
              contact_person: appData.contact_person,
            },
          );

          let emailReceivedAt: string;
          try {
            emailReceivedAt = new Date(message.date).toISOString();
          } catch {
            emailReceivedAt = new Date().toISOString();
          }

          // Upsert email row
          const { data: existingEmail } = await admin
            .from("emails")
            .select("id")
            .eq("provider", "gmail")
            .eq("provider_message_id", message.messageId)
            .single();

          let emailId: number;
          if (existingEmail) {
            emailId = existingEmail.id;
          } else {
            const { data: emailRow, error: emailErr } = await admin
              .from("emails")
              .insert({
                user_id: userId,
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
              console.error(`[cron] Failed to insert email for user ${userId}:`, emailErr);
              return;
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
          processedCount++;
        } catch (err) {
          console.error(`[cron] Error processing email ${selected.messageId} for user ${userId}:`, err);
        }
      }),
    );
  }

  // 7. Bulk recalculate affected applications
  for (const appId of processedAppIds) {
    await recalculateApplication(admin, appId);
  }

  return { userId, scanned: gmailMessages.length, processed: processedCount };
}

/**
 * Handle incoming cron trigger.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowHour = new Date().getUTCHours();

  // Fetch all users due to scan at this hour
  const { data: prefs, error: prefsErr } = await admin
    .from("user_scan_preferences")
    .select("user_id, scan_window_start, last_scan_time, preferred_scan_hour")
    .eq("auto_scan_enabled", true)
    .eq("preferred_scan_hour", nowHour);

  if (prefsErr) {
    console.error("[cron] Failed to fetch scan preferences:", prefsErr);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  const users = prefs ?? [];
  console.log(`[cron] ${users.length} user(s) scheduled for hour ${nowHour} UTC`);

  if (users.length === 0) {
    return NextResponse.json({ ok: true, processed_users: 0 });
  }

  // Run scans sequentially to avoid overwhelming APIs
  const results = [];
  for (const pref of users) {
    const result = await scanForUser(
      admin,
      pref.user_id,
      pref.scan_window_start,
      pref.last_scan_time,
    );
    results.push(result);

    // Update last_scan_time regardless of outcome (prevents tight retry loops)
    await admin
      .from("user_scan_preferences")
      .update({ last_scan_time: new Date().toISOString() })
      .eq("user_id", pref.user_id);
  }

  return NextResponse.json({ ok: true, processed_users: users.length, results });
}
