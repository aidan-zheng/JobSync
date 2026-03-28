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

// Recalculates the current application state by replaying all active field events
// in chronological order (or reverse chronological order and picking the first).
export async function recalculateApplication(
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
    if (fieldName === "salary_yearly") continue; // deprecated or unused
    recalculated[fieldName] = value;
  }

  const fieldsWithPossibleEvents = [
    "status",
    "salary_per_hour",
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
      field_name: "salary_per_hour",
      value_number: parsed.salary_per_hour,
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
