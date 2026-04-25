import { createAdminClient } from "@/lib/supabase/admin";
import type { ParsedEmailUpdate } from "@/lib/llm-parser";
import { parseConfidenceNum } from "@/types/applications";

// Extracts the single scalar value from a field event row.
export function extractFieldValue(
  fieldName: string,
  event: Record<string, any>,
): unknown {
  switch (fieldName) {
    case "status":
      return event.value_status ?? null;
    case "compensation_amount":
    case "salary_per_hour":
    case "salary_yearly":
      return event.value_number ?? null;
    case "salary_type":
      return event.value_text ?? null;
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

// Recalculates the current application state by replaying all active field events
// in chronological order (or reverse chronological order and picking the first).
export async function recalculateApplication(
  admin: ReturnType<typeof createAdminClient>,
  applicationId: number,
) {
  // Fetch inactive email IDs to exclude from recalculation
  const { data: inactiveLinks } = await admin
    .from("application_email_links")
    .select("email_id")
    .eq("application_id", applicationId)
    .eq("is_active", false);

  const excludeEmailIds = new Set(
    (inactiveLinks ?? []).map((l: { email_id: number }) => l.email_id),
  );

  const { data: allEvents } = await admin
    .from("application_field_events")
    .select("*")
    .eq("application_id", applicationId)
    .order("event_time", { ascending: false });

  const recalculated: Record<string, unknown> = {};
  const seenFields = new Set<string>();

  for (const event of allEvents ?? []) {
    const fieldName = event.field_name as string;
    if (event.email_id != null && excludeEmailIds.has(event.email_id)) continue;
    const value = extractFieldValue(fieldName, event);

    if (fieldName === "compensation_amount") {
      if (!seenFields.has("compensation_amount")) {
        recalculated.compensation_amount = value ?? null;
        seenFields.add("compensation_amount");
      }
      continue;
    }

    if (fieldName === "salary_type") {
      if (!seenFields.has("salary_type")) {
        recalculated.salary_type = value ?? null;
        seenFields.add("salary_type");
      }
      continue;
    }

    if (fieldName === "salary_per_hour" || fieldName === "salary_yearly") {
      if (!seenFields.has("compensation_amount")) {
        recalculated.compensation_amount = value ?? null;
        seenFields.add("compensation_amount");
      }
      if (!seenFields.has("salary_type")) {
        recalculated.salary_type =
          fieldName === "salary_yearly" ? "yearly" : "hourly";
        seenFields.add("salary_type");
      }
      continue;
    }

    if (seenFields.has(fieldName)) continue;
    seenFields.add(fieldName);
    recalculated[fieldName] = value;
  }

  const fieldsWithPossibleEvents = [
    "status",
    "compensation_amount",
    "salary_type",
    "location_type",
    "location",
    "contact_person",
    "date_applied",
    "notes",
  ];
  for (const f of fieldsWithPossibleEvents) {
    if (!(f in recalculated)) recalculated[f] = null;
  }

  if (recalculated.status == null) recalculated.status = "applied";
  if (recalculated.date_applied == null) {
    recalculated.date_applied = new Date().toISOString().slice(0, 10);
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

// Builds an array of database rows for application_field_events from a parsed email update.
export function buildFieldEvents(
  applicationId: number,
  emailId: number,
  parsed: ParsedEmailUpdate,
  eventTime: string,
): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  const confidence = parseConfidenceNum(parsed.confidence);

  if (parsed.status) {
    events.push({
      application_id: applicationId,
      source_type: "email",
      email_id: emailId,
      field_name: "status",
      value_status: parsed.status,
      event_time: eventTime,
      confidence,
    });
  }
  if (parsed.salary_per_hour != null) {
    events.push({
      application_id: applicationId,
      source_type: "email",
      email_id: emailId,
      field_name: "compensation_amount",
      value_number: parsed.salary_per_hour,
      event_time: eventTime,
      confidence,
    });
    events.push({
      application_id: applicationId,
      source_type: "email",
      email_id: emailId,
      field_name: "salary_type",
      value_text: "hourly",
      event_time: eventTime,
      confidence,
    });
  }
  if (parsed.location_type) {
    events.push({
      application_id: applicationId,
      source_type: "email",
      email_id: emailId,
      field_name: "location_type",
      value_location_type: parsed.location_type,
      event_time: eventTime,
      confidence,
    });
  }
  if (parsed.location) {
    events.push({
      application_id: applicationId,
      source_type: "email",
      email_id: emailId,
      field_name: "location",
      value_text: parsed.location,
      event_time: eventTime,
      confidence,
    });
  }
  if (parsed.contact_person) {
    events.push({
      application_id: applicationId,
      source_type: "email",
      email_id: emailId,
      field_name: "contact_person",
      value_text: parsed.contact_person,
      event_time: eventTime,
      confidence,
    });
  }
  if (parsed.notes) {
    events.push({
      application_id: applicationId,
      source_type: "email",
      email_id: emailId,
      field_name: "notes",
      value_text: parsed.notes,
      event_time: eventTime,
      confidence,
    });
  }

  return events;
}
