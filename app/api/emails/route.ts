/**
 * Handles fetching, toggling, and deleting emails linked to applications. Triggers state recalculation to maintain chronological accuracy when email links are modified.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAppOwner } from "@/lib/supabase/api-auth";
import type { Confidence } from "@/types/applications";

import { parseConfidenceNum, parseConfidenceString } from "@/types/applications";

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

  const auth = await requireAppOwner(request, applicationId);
  if (auth.errorResponse) return auth.errorResponse;
  const { admin } = auth;

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
        confidence: parseConfidenceString(row.confidence),
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

  const auth = await requireAppOwner(request, applicationId);
  if (auth.errorResponse) return auth.errorResponse;
  const { user, admin } = auth;

  const confidenceNum = parseConfidenceNum(body.confidence);
  const confidence = parseConfidenceString(confidenceNum);

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

import { recalculateApplication } from "@/lib/applications";

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

  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;
  const { user, admin } = auth;

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

  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;
  const { user, admin } = auth;

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
  const emailIds = links.map((l: any) => l.email_id);
  const linkIds = links.map((l: any) => l.id);

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
