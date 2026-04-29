/**
 * Handles fetching the user's list of current applications and creating new applications (both via manual input and automated scraping).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/api-auth";
import { isSalaryType } from "@/lib/compensation";
import { getLocalDateInputValue, parseDateOnly } from "@/lib/date-only";
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
  LocationType,
  SalaryType,
} from "@/types/applications";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;
  const { user, admin } = auth;

  // joins application_current with applications to filter by user_id in a single query.
  const { data, error } = await admin
    .from("application_current")
    .select("*, applications!inner(user_id)")
    .eq("applications.user_id", user.id)
    .order("date_applied", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // clean up inner join metadata from the response
  const cleanedData = (data ?? []).map(({ applications, ...rest }) => rest);

  return NextResponse.json(cleanedData);
}

const MANUAL_DEFAULTS = {
  company_name: "Company",
  job_title: "Job Title",
  compensation_amount: null as number | null,
  salary_type: null as SalaryType | null,
  location_type: null as LocationType | null,
  location: null as string | null,
  date_applied: getLocalDateInputValue(),
  contact_person: null as string | null,
  status: "applied" as ApplicationStatus,
  notes: null as string | null,
};

export type CreateApplicationBody =
  | { mode: "automatic"; job_url?: string; pasted_text?: string }
  | {
    mode: "manual";
    company_name?: string;
    job_title?: string;
    compensation_amount?: number | null;
    salary_type?: SalaryType | null;
    location_type?: LocationType | null;
    location?: string | null;
    date_applied?: string;
    contact_person?: string | null;
    status?: ApplicationStatus;
    notes?: string | null;
  };

export async function POST(request: NextRequest) {
  let body: CreateApplicationBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = body?.mode ?? "manual";

  if (mode === "automatic") {
    const jobUrl = "job_url" in body ? body.job_url : "";
    const pastedText = "pasted_text" in body ? body.pasted_text : "";
    if (!jobUrl && !pastedText) {
      return NextResponse.json({ error: "Missing job_url or pasted_text" }, { status: 400 });
    }

    if (pastedText && pastedText.length > APPLICATION_TEXT_LIMITS.pasted_text) {
      return NextResponse.json(
        { error: `Pasted text must be ${APPLICATION_TEXT_LIMITS.pasted_text} characters or fewer` },
        { status: 400 }
      );
    }

    try {
      const baseUrl = request.nextUrl.origin;
      const autoImportResp = await fetch(`${baseUrl}/api/applications/auto-import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": request.headers.get("Cookie") || "",
          "Authorization": request.headers.get("Authorization") || "",
        },
        body: JSON.stringify({ job_url: jobUrl, pasted_text: pastedText }),
      });

      if (!autoImportResp.ok) {
        const errText = await autoImportResp.text();
        let parsedErr;
        try { parsedErr = JSON.parse(errText); } catch { parsedErr = null; }
        return NextResponse.json(
          { error: parsedErr?.error || "Auto-import proxy failed" },
          { status: autoImportResp.status }
        );
      }

      const autoImportData = await autoImportResp.json();
      return NextResponse.json(autoImportData);
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Internal network failure" }, { status: 500 });
    }
  }

  const manual =
    body.mode === "manual"
      ? body
      : { mode: "manual" as const, ...MANUAL_DEFAULTS };

  const limitedTextFields = [
    ["job_url", ""],
    ["company_name", manual.company_name ?? ""],
    ["job_title", manual.job_title ?? ""],
    ["location", manual.location ?? ""],
    ["contact_person", manual.contact_person ?? ""],
    ["notes", manual.notes ?? ""],
  ] as const;

  for (const [field, value] of limitedTextFields) {
    if (
      typeof value === "string" &&
      !isWithinTextLimit(field, value.trim())
    ) {
      return NextResponse.json(
        {
          error: `${field.replaceAll("_", " ")} must be ${APPLICATION_TEXT_LIMITS[field]} characters or fewer`,
        },
        { status: 400 },
      );
    }
  }

  const compensationAmount = parseOptionalNumber(manual.compensation_amount);
  const salaryValidationError =
    manual.compensation_amount !== undefined
      ? getSalaryValidationError(compensationAmount)
      : null;
  if (salaryValidationError) {
    return NextResponse.json(
      { error: salaryValidationError },
      { status: 400 },
    );
  }

  if (
    manual.salary_type !== undefined &&
    manual.salary_type !== null &&
    !isSalaryType(manual.salary_type)
  ) {
    return NextResponse.json(
      { error: "salary_type must be hourly, weekly, biweekly, monthly, or yearly" },
      { status: 400 },
    );
  }

  const row = {
    company_name: manual.company_name?.trim() ?? MANUAL_DEFAULTS.company_name,
    job_title: manual.job_title?.trim() ?? MANUAL_DEFAULTS.job_title,
    compensation_amount:
      manual.compensation_amount !== undefined
        ? compensationAmount
        : MANUAL_DEFAULTS.compensation_amount,
    salary_type:
      manual.salary_type !== undefined
        ? manual.salary_type
        : MANUAL_DEFAULTS.salary_type,
    location_type:
      manual.location_type !== undefined
        ? manual.location_type
        : MANUAL_DEFAULTS.location_type,
    location:
      manual.location !== undefined
        ? (manual.location?.trim() ?? null)
        : MANUAL_DEFAULTS.location,
    date_applied: manual.date_applied?.trim() || MANUAL_DEFAULTS.date_applied,
    contact_person:
      manual.contact_person !== undefined
        ? (manual.contact_person?.trim() ?? null)
        : MANUAL_DEFAULTS.contact_person,
    status: manual.status ?? MANUAL_DEFAULTS.status,
    notes:
      manual.notes !== undefined
        ? (manual.notes?.trim() ?? null)
        : MANUAL_DEFAULTS.notes,
  };

  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;
  const { user, admin } = auth;

  const jobUrl = null;

  const { data: parentRow, error: parentError } = await admin
    .from("applications")
    .insert({ user_id: user.id, job_url: jobUrl || undefined })
    .select("id")
    .single();

  if (parentError) {
    return NextResponse.json(
      { error: "Could not create application: " + parentError.message },
      { status: 500 },
    );
  }

  const applicationId = parentRow?.id;
  if (applicationId == null) {
    return NextResponse.json(
      { error: "Insert did not return an id" },
      { status: 500 },
    );
  }

  const { data, error } = await admin
    .from("application_current")
    .insert({ ...row, application_id: applicationId })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sourceType = "manual";

  // prevents date shifts
  const dateObj = parseDateOnly(row.date_applied);
  const initialEventTime = dateObj ? dateObj.toISOString() : new Date().toISOString();

  const initialEvents: Record<string, unknown>[] = [];

  if (row.status) {
    initialEvents.push({
      application_id: applicationId,
      field_name: "status",
      source_type: sourceType,
      value_status: row.status,
      event_time: initialEventTime,
    });
  }
  if (row.compensation_amount != null) {
    initialEvents.push({
      application_id: applicationId,
      field_name: "compensation_amount",
      source_type: sourceType,
      value_number: row.compensation_amount,
      event_time: initialEventTime,
    });
  }
  if (row.salary_type) {
    initialEvents.push({
      application_id: applicationId,
      field_name: "salary_type",
      source_type: sourceType,
      value_text: row.salary_type,
      event_time: initialEventTime,
    });
  }
  if (row.location_type) {
    initialEvents.push({
      application_id: applicationId,
      field_name: "location_type",
      source_type: sourceType,
      value_location_type: row.location_type,
      event_time: initialEventTime,
    });
  }
  if (row.location) {
    initialEvents.push({
      application_id: applicationId,
      field_name: "location",
      source_type: sourceType,
      value_text: row.location,
      event_time: initialEventTime,
    });
  }
  if (row.contact_person) {
    initialEvents.push({
      application_id: applicationId,
      field_name: "contact_person",
      source_type: sourceType,
      value_text: row.contact_person,
      event_time: initialEventTime,
    });
  }
  if (row.date_applied) {
    initialEvents.push({
      application_id: applicationId,
      field_name: "date_applied",
      source_type: sourceType,
      value_date: row.date_applied,
      event_time: initialEventTime,
    });
  }
  if (row.notes) {
    initialEvents.push({
      application_id: applicationId,
      field_name: "notes",
      source_type: sourceType,
      value_text: row.notes,
      event_time: initialEventTime,
    });
  }

  if (initialEvents.length > 0) {
    const { error: eventError } = await admin
      .from("application_field_events")
      .insert(initialEvents);

    if (eventError) {
      console.error("application_field_events insert failed:", eventError);
    }
  }

  return NextResponse.json(data);
}
