import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/supabase/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLocalDateInputValue } from "@/lib/date-only";
import {
  APPLICATION_TEXT_LIMITS,
  isWithinTextLimit,
} from "@/lib/application-field-limits";
import type {
  ApplicationStatus,
  ApplicationFieldName,
  LocationType,
} from "@/types/applications";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const user = await getApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("application_current")
    .select("*")
    .eq("id", idNum)
    .single();

  if (error || !row) {
    return NextResponse.json(
      { error: "Application not found" },
      { status: 404 },
    );
  }

  const { data: parent } = await admin
    .from("applications")
    .select("user_id")
    .eq("id", row.application_id)
    .single();
  if (parent?.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(row);
}

function buildUpdateAndEvent(
  field_name: ApplicationFieldName,
  value: unknown,
): {
  currentUpdate: Record<string, unknown>;
  eventPayload: Record<string, unknown>;
} {
  const eventPayload: Record<string, unknown> = {
    field_name,
    source_type: "manual",
    event_time: new Date().toISOString(),
  };

  switch (field_name) {
    case "salary_per_hour": {
      const n = value === "" || value == null ? null : Number(value);
      return {
        currentUpdate: { salary_per_hour: n },
        eventPayload: { ...eventPayload, value_number: n },
      };
    }
    case "salary_yearly": {
      const n = value === "" || value == null ? null : Number(value);
      return {
        currentUpdate: {},
        eventPayload: { ...eventPayload, value_number: n },
      };
    }
    case "location_type": {
      const v =
        value === "" || value == null
          ? null
          : (String(value) as LocationType);
      return {
        currentUpdate: { location_type: v },
        eventPayload: { ...eventPayload, value_location_type: v },
      };
    }
    case "location": {
      const v = value === "" || value == null ? null : String(value);
      return {
        currentUpdate: { location: v },
        eventPayload: { ...eventPayload, value_text: v },
      };
    }
    case "contact_person": {
      const v = value === "" || value == null ? null : String(value);
      return {
        currentUpdate: { contact_person: v },
        eventPayload: { ...eventPayload, value_text: v },
      };
    }
    case "status": {
      const v =
        value === "" || value == null
          ? null
          : (String(value) as ApplicationStatus);
      return {
        currentUpdate: { status: v ?? "applied" },
        eventPayload: { ...eventPayload, value_status: v },
      };
    }
    case "date_applied": {
      const v = value === "" || value == null ? null : String(value);
      return {
        currentUpdate: { date_applied: v ?? getLocalDateInputValue() },
        eventPayload: { ...eventPayload, value_date: v },
      };
    }
    case "notes": {
      const v = value === "" || value == null ? null : String(value);
      return {
        currentUpdate: { notes: v },
        eventPayload: { ...eventPayload, value_text: v },
      };
    }
    default:
      return { currentUpdate: {}, eventPayload };
  }
}

const ALLOWED_FIELDS: ApplicationFieldName[] = [
  "salary_per_hour",
  "salary_yearly",
  "location_type",
  "location",
  "contact_person",
  "status",
  "date_applied",
  "notes",
];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: { field_name?: ApplicationFieldName; value?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const field_name = body?.field_name;
  const value = body?.value;

  if (!field_name || !ALLOWED_FIELDS.includes(field_name)) {
    return NextResponse.json(
      { error: "Missing or invalid field_name" },
      { status: 400 },
    );
  }

  if (
    (field_name === "location" ||
      field_name === "contact_person" ||
      field_name === "notes") &&
    typeof value === "string"
  ) {
    const limitField =
      field_name === "location"
        ? "location"
        : field_name === "contact_person"
          ? "contact_person"
          : "notes";

    if (!isWithinTextLimit(limitField, value)) {
      return NextResponse.json(
        {
          error: `${field_name.replaceAll("_", " ")} must be ${APPLICATION_TEXT_LIMITS[limitField]} characters or fewer`,
        },
        { status: 400 },
      );
    }
  }

  const user = await getApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: row, error: fetchError } = await admin
    .from("application_current")
    .select("application_id")
    .eq("id", idNum)
    .single();

  if (fetchError || !row) {
    return NextResponse.json(
      { error: "Application not found" },
      { status: 404 },
    );
  }

  const { data: parent } = await admin
    .from("applications")
    .select("user_id")
    .eq("id", row.application_id)
    .single();
  if (parent?.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { currentUpdate, eventPayload } = buildUpdateAndEvent(field_name, value);

  if (Object.keys(currentUpdate).length > 0) {
    const { error: updateError } = await admin
      .from("application_current")
      .update({ ...currentUpdate, updated_at: new Date().toISOString() })
      .eq("id", idNum);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }
  }

  // Build event row in table column order so position-based mapping never swaps source_type and field_name
  const eventTime = new Date().toISOString();
  const eventRow = {
    application_id: row.application_id,
    email_id: null as number | null,
    field_name: field_name,
    value_text: (eventPayload.value_text as string | undefined) ?? null,
    value_number: (eventPayload.value_number as number | undefined) ?? null,
    value_date: (eventPayload.value_date as string | undefined) ?? null,
    value_location_type: (eventPayload.value_location_type as string | undefined) ?? null,
    value_status: (eventPayload.value_status as string | undefined) ?? null,
    event_time: eventTime,
    confidence: null as number | null,
    source_type: "manual" as const,
  };

  if (process.env.NODE_ENV === "development") {
    console.log("[application_field_events] insert payload:", JSON.stringify(eventRow));
  }

  const { error: eventError } = await admin
    .from("application_field_events")
    .insert(eventRow);

  if (eventError) {
    console.error("application_field_events insert failed:", eventError);
    return NextResponse.json(
      {
        error: "Field saved but timeline event failed",
        details: eventError.message,
      },
      { status: 500 },
    );
  }

  const { data: updated } = await admin
    .from("application_current")
    .select("*")
    .eq("id", idNum)
    .single();

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const user = await getApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: row, error: fetchError } = await admin
    .from("application_current")
    .select("application_id")
    .eq("id", idNum)
    .single();

  if (fetchError || !row) {
    return NextResponse.json(
      { error: "Application not found" },
      { status: 404 },
    );
  }

  const applicationId = row.application_id;

  const { data: parent, error: parentError } = await admin
    .from("applications")
    .select("user_id")
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

  const { data: links, error: linksError } = await admin
    .from("application_email_links")
    .select("email_id")
    .eq("application_id", applicationId);

  if (linksError) {
    return NextResponse.json({ error: linksError.message }, { status: 500 });
  }

  const emailIds = (links ?? [])
    .map((l) => Number((l as { email_id: number }).email_id))
    .filter((n) => Number.isInteger(n));

  const { error: deleteEventsError } = await admin
    .from("application_field_events")
    .delete()
    .eq("application_id", applicationId);

  if (deleteEventsError) {
    return NextResponse.json(
      { error: deleteEventsError.message },
      { status: 500 },
    );
  }

  const { error: deleteLinksError } = await admin
    .from("application_email_links")
    .delete()
    .eq("application_id", applicationId);

  if (deleteLinksError) {
    return NextResponse.json(
      { error: deleteLinksError.message },
      { status: 500 },
    );
  }

  if (emailIds.length > 0) {
    const { data: remainingLinks, error: remainingLinksError } = await admin
      .from("application_email_links")
      .select("email_id")
      .in("email_id", emailIds);

    if (remainingLinksError) {
      return NextResponse.json(
        { error: remainingLinksError.message },
        { status: 500 },
      );
    }

    const stillReferenced = new Set(
      (remainingLinks ?? []).map((l) => Number((l as { email_id: number }).email_id)),
    );

    const deletableEmailIds = emailIds.filter((id) => !stillReferenced.has(id));
    if (deletableEmailIds.length > 0) {
      const { error: deleteEmailsError } = await admin
        .from("emails")
        .delete()
        .in("id", deletableEmailIds);

      if (deleteEmailsError) {
        return NextResponse.json(
          { error: deleteEmailsError.message },
          { status: 500 },
        );
      }
    }
  }

  const { error: deleteCurrentError } = await admin
    .from("application_current")
    .delete()
    .eq("application_id", applicationId);

  if (deleteCurrentError) {
    return NextResponse.json(
      { error: deleteCurrentError.message },
      { status: 500 },
    );
  }

  const { error: deleteParentError } = await admin
    .from("applications")
    .delete()
    .eq("id", applicationId);

  if (deleteParentError) {
    return NextResponse.json(
      { error: deleteParentError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
