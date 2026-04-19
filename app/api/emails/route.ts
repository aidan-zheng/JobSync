import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/supabase/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLocalDateInputValue } from "@/lib/date-only";
import type { Confidence } from "@/types/applications";

function parseConfidence(value: unknown): Confidence {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "medium";
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const applicationIdParam = searchParams.get("application_id");

  const applicationId = applicationIdParam ? Number(applicationIdParam) : NaN;
  if (!Number.isInteger(applicationId)) {
    return NextResponse.json(
      { error: "Missing or invalid application_id" },
      { status: 400 },
    );
  }

  const user = await getApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: parent, error: parentError } = await admin
    .from("applications")
    .select("id, user_id")
    .eq("id", applicationId)
    .single();

  if (parentError || !parent) {
    return NextResponse.json(
      { error: "Application not found" },
      { status: 404 },
    );
  }

  if (parent.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: links, error } = await admin
    .from("application_email_links")
    .select(
      "id, application_id, confidence, is_active, emails!inner(id, subject, from_email, received_at)",
    )
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type EmailRow = { id: number; subject: string | null; from_email: string | null; received_at: string | null };

  const mapped = (links ?? []).map(
    (row: {
      id: number;
      application_id: number;
      confidence: number | null;
      is_active: boolean;
      emails: EmailRow | EmailRow[];
    }) => {
      const email = Array.isArray(row.emails) ? row.emails[0] : row.emails;
      return {
        id: String(email?.id ?? row.application_id),
        link_id: row.id,
        application_id: String(row.application_id),
        subject: email?.subject ?? "",
        sender: email?.from_email ?? "",
        received_date: email?.received_at
          ? new Date(email.received_at).toISOString()
          : "",
        confidence:
          row.confidence === 3 ? "high" : row.confidence === 1 ? "low" : "medium",
        linked: row.is_active,
      };
    },
  );

  return NextResponse.json(mapped);
}

interface CreateEmailBody {
  application_id: number;
  subject: string;
  sender: string;
  received_date: string;
  confidence?: Confidence;
  linked?: boolean;
}

export async function POST(request: NextRequest) {
  let body: CreateEmailBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const applicationId = Number(body.application_id);
  if (!Number.isInteger(applicationId)) {
    return NextResponse.json(
      { error: "application_id must be an integer" },
      { status: 400 },
    );
  }

  const subject = body.subject?.trim();
  const sender = body.sender?.trim();
  const receivedDate = body.received_date?.trim();

  if (!subject || !sender || !receivedDate) {
    return NextResponse.json(
      { error: "subject, sender, and received_date are required" },
      { status: 400 },
    );
  }

  const user = await getApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: parent, error: parentError } = await admin
    .from("applications")
    .select("id, user_id")
    .eq("id", applicationId)
    .single();

  if (parentError || !parent) {
    return NextResponse.json(
      { error: "Application not found" },
      { status: 404 },
    );
  }

  if (parent.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const confidence = parseConfidence(body.confidence);
  const confidenceNum = confidence === "high" ? 3 : confidence === "low" ? 1 : 2;

  const { data: emailRow, error: emailError } = await admin
    .from("emails")
    .insert({
      user_id: user.id,
      from_email: sender,
      subject,
      received_at: receivedDate,
    })
    .select("id")
    .single();

  if (emailError) {
    return NextResponse.json({ error: emailError.message }, { status: 500 });
  }

  const emailId = emailRow?.id;
  if (emailId == null) {
    return NextResponse.json(
      { error: "Email insert did not return id" },
      { status: 500 },
    );
  }

  const { data: linkRow, error: linkError } = await admin
    .from("application_email_links")
    .insert({
      application_id: applicationId,
      email_id: emailId,
      source: "api",
      confidence: confidenceNum,
      is_active: body.linked ?? true,
    })
    .select("application_id, confidence, is_active")
    .single();

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  const response = {
    id: String(emailId),
    application_id: String(applicationId),
    subject,
    sender,
    received_date: receivedDate,
    confidence,
    linked: linkRow?.is_active ?? true,
  };

  return NextResponse.json(response, { status: 201 });
}

function extractFieldValue(
  fieldName: string,
  event: Record<string, unknown>,
): unknown {
  switch (fieldName) {
    case "status":
      return event.value_status ?? null;
    case "salary_per_hour":
      return event.value_number ?? null;
    case "location_type":
      return event.value_location_type ?? null;
    case "location":
    case "contact_person":
    case "notes":
      return event.value_text ?? null;
    case "date_applied":
      return event.value_date ?? null;
    default:
      return null;
  }
}

async function recalculateApplication(
  admin: ReturnType<typeof createAdminClient>,
  applicationId: number,
  excludeEmailIds: Set<number>,
) {
  const { data: allEvents } = await admin
    .from("application_field_events")
    .select("*")
    .eq("application_id", applicationId)
    .order("event_time", { ascending: false });

  const recalculated: Record<string, unknown> = {};
  const seenFields = new Set<string>();

  for (const event of allEvents ?? []) {
    const fieldName = event.field_name as string;
    if (seenFields.has(fieldName)) continue;
    if (event.email_id != null && excludeEmailIds.has(event.email_id)) continue;

    seenFields.add(fieldName);
    const value = extractFieldValue(fieldName, event);
    if (fieldName === "salary_yearly") continue;
    recalculated[fieldName] = value;
  }

  const fieldsWithPossibleEvents = [
    "status", "salary_per_hour", "location_type",
    "location", "contact_person", "date_applied", "notes",
  ];
  for (const f of fieldsWithPossibleEvents) {
    if (!(f in recalculated)) recalculated[f] = null;
  }

  if (recalculated.status == null) recalculated.status = "applied";
  if (recalculated.date_applied == null) {
    recalculated.date_applied = getLocalDateInputValue();
  }
  recalculated.updated_at = new Date().toISOString();

  await admin
    .from("application_current")
    .update(recalculated)
    .eq("application_id", applicationId);

  const { data: updatedApp } = await admin
    .from("application_current")
    .select("*")
    .eq("application_id", applicationId)
    .single();

  return updatedApp;
}

export async function PATCH(request: NextRequest) {
  let body: { link_id: number; is_active: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.link_id !== "number" || typeof body.is_active !== "boolean") {
    return NextResponse.json(
      { error: "link_id (number) and is_active (boolean) are required" },
      { status: 400 },
    );
  }

  const user = await getApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: link, error: linkErr } = await admin
    .from("application_email_links")
    .select("id, email_id, application_id, applications!inner(user_id)")
    .eq("id", body.link_id)
    .single();

  if (linkErr || !link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  const apps = link.applications as unknown as { user_id: string } | { user_id: string }[];
  const ownerUserId = Array.isArray(apps) ? apps[0]?.user_id : apps?.user_id;

  if (ownerUserId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: updateErr } = await admin
    .from("application_email_links")
    .update({ is_active: body.is_active })
    .eq("id", body.link_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const applicationId = link.application_id;

  const { data: inactiveLinks } = await admin
    .from("application_email_links")
    .select("email_id")
    .eq("application_id", applicationId)
    .eq("is_active", false);

  const inactiveEmailIds = new Set(
    (inactiveLinks ?? []).map((l: { email_id: number }) => l.email_id),
  );

  const updatedApp = await recalculateApplication(admin, applicationId, inactiveEmailIds);

  return NextResponse.json({ ok: true, application: updatedApp });
}

export async function DELETE(request: NextRequest) {
  let body: { link_ids: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.link_ids) || body.link_ids.length === 0) {
    return NextResponse.json(
      { error: "link_ids must be a non-empty array of numbers" },
      { status: 400 },
    );
  }

  const user = await getApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: links, error: linksErr } = await admin
    .from("application_email_links")
    .select("id, email_id, application_id, applications!inner(user_id)")
    .in("id", body.link_ids);

  if (linksErr || !links || links.length === 0) {
    return NextResponse.json({ error: "Links not found" }, { status: 404 });
  }

  for (const l of links) {
    const a = l.applications as unknown as { user_id: string } | { user_id: string }[];
    const uid = Array.isArray(a) ? a[0]?.user_id : a?.user_id;
    if (uid !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const applicationId = links[0].application_id;
  const emailIds = links.map((l) => l.email_id);
  const linkIds = links.map((l) => l.id);

  await admin
    .from("application_field_events")
    .delete()
    .eq("application_id", applicationId)
    .in("email_id", emailIds);

  await admin
    .from("application_email_links")
    .delete()
    .in("id", linkIds);

  await admin
    .from("emails")
    .delete()
    .in("id", emailIds);

  const { data: remainingInactive } = await admin
    .from("application_email_links")
    .select("email_id")
    .eq("application_id", applicationId)
    .eq("is_active", false);

  const inactiveEmailIds = new Set(
    (remainingInactive ?? []).map((l: { email_id: number }) => l.email_id),
  );

  const updatedApp = await recalculateApplication(admin, applicationId, inactiveEmailIds);

  return NextResponse.json({ ok: true, application: updatedApp });
}
