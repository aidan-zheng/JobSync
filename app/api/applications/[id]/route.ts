/**
 * Manages detailed operations for a specific job application: retrieving its derived state, manually updating individual fields, and fully deleting the application alongside its timeline history.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCurrentAppOwner } from "@/lib/supabase/api-auth";
import { isSalaryType } from "@/lib/compensation";
import { getLocalDateInputValue } from "@/lib/date-only";
import {
  APPLICATION_TEXT_LIMITS,
  isWithinTextLimit,
} from "@/lib/application-field-limits";
import {
  getSalaryValidationError,
  parseOptionalNumber,
} from "@/lib/salary-validation";
import type {
  ApplicationStatus,
  ApplicationFieldName,
  LocationType,
  SalaryType,
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

  const auth = await requireCurrentAppOwner(request, idNum);
  if (auth.errorResponse) return auth.errorResponse;

  return NextResponse.json(auth.row);
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
    case "compensation_amount": {
      const n = value === "" || value == null ? null : Number(value);
      return {
        currentUpdate: { compensation_amount: n },
        eventPayload: { ...eventPayload, value_number: n },
      };
    }
    case "salary_type": {
      const v =
        value === "" || value == null
          ? null
          : (String(value) as SalaryType);
      return {
        currentUpdate: { salary_type: v },
        eventPayload: { ...eventPayload, value_text: v },
      };
    }
    case "salary_per_hour": {
      const n = value === "" || value == null ? null : Number(value);
      return {
        currentUpdate: {
          compensation_amount: n,
          salary_type: n == null ? null : "hourly",
        },
        eventPayload: {
          ...eventPayload,
          field_name: "compensation_amount",
          value_number: n,
        },
      };
    }
    case "salary_yearly": {
      const n = value === "" || value == null ? null : Number(value);
      return {
        currentUpdate: {
          compensation_amount: n,
          salary_type: n == null ? null : "yearly",
        },
        eventPayload: {
          ...eventPayload,
          field_name: "compensation_amount",
          value_number: n,
        },
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
  "compensation_amount",
  "salary_type",
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

  if (
    field_name === "compensation_amount" ||
    field_name === "salary_per_hour" ||
    field_name === "salary_yearly"
  ) {
    const salaryValue = parseOptionalNumber(value);
    const salaryValidationError = getSalaryValidationError(salaryValue);
    if (salaryValidationError) {
      return NextResponse.json(
        { error: salaryValidationError },
        { status: 400 },
      );
    }
  }

  if (
    field_name === "salary_type" &&
    value !== "" &&
    value != null &&
    !isSalaryType(value)
  ) {
    return NextResponse.json(
      { error: "salary_type must be hourly, weekly, biweekly, monthly, or yearly" },
      { status: 400 },
    );
  }

  const auth = await requireCurrentAppOwner(request, idNum);
  if (auth.errorResponse) return auth.errorResponse;
  const { admin, applicationId } = auth;

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
    application_id: applicationId,
    email_id: null as number | null,
    field_name: (eventPayload.field_name as ApplicationFieldName | undefined) ?? field_name,
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

  const auth = await requireCurrentAppOwner(request, idNum);
  if (auth.errorResponse) return auth.errorResponse;
  const { admin, applicationId } = auth;

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
