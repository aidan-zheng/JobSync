import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/supabase/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJobPage } from "@/lib/llm-parser";
import type {
  ApplicationStatus,
  LocationType,
  SalaryType,
} from "@/types/applications";

type AutoImportBody = {
  job_url?: string | null;
  pasted_text?: string | null;
};

type ExtractionFields = {
  company_name?: unknown;
  job_title?: unknown;
  compensation_amount?: unknown;
  salary_type?: unknown;
  location_type?: unknown;
  location?: unknown;
  contact_person?: unknown;
  notes?: unknown;
  is_job_posting?: unknown;
};



const MANUAL_DEFAULTS = {
  company_name: "Company",
  job_title: "Job Title",
  compensation_amount: null as number | null,
  salary_type: null as SalaryType | null,
  location_type: null as LocationType | null,
  location: null as string | null,
  contact_person: null as string | null,
  status: "applied" as ApplicationStatus,
  notes: null as string | null,
};

const USER_AGENT = "Pipply/auto-import (contact: dev@pipply.vercel.com)";
const MAX_HTML_CHARS = 300_000;
const MAX_TEXT_CHARS = 12_000;
const FETCH_TIMEOUT_MS = 15_000;

function normalizeHttpUrl(input: string): string | null {
  try {
    let cleanInput = input.trim();
    if (!cleanInput) return null;

    // accept http or https
    if (/^https?:\/\//i.test(cleanInput)) {
      const u = new URL(cleanInput);
      return u.toString();
    }

    // reject ftp or other protocols
    if (/^[a-zA-Z0-9+.-]+:\/\//i.test(cleanInput)) {
      return null;
    }

    // prepend https:// without protocol
    const u = new URL("https://" + cleanInput);
    return u.toString();
  } catch {
    return null;
  }
}

function stripHtmlToText(html: string): string {
  const withoutScripts = html.replace(
    /<script[^>]*>[\s\S]*?<\/script>/gi,
    " ",
  );
  const withoutStyles = withoutScripts.replace(
    /<style[^>]*>[\s\S]*?<\/style>/gi,
    " ",
  );
  const withoutTags = withoutStyles.replace(/<\/?[^>]+(>|$)/g, " ");
  return withoutTags.replace(/\s+/g, " ").trim();
}

function cleanPastedText(text: string): string {
  const lines = text.split(/\r?\n/);
  const filtered = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;

    // Skip common boilerplate
    if (/copyright|terms of (?:service|use)|privacy policy|cookie policy/i.test(trimmed)) return false;

    // Skip very short lines that are purely navigation or UI noise
    if (trimmed.length < 20) {
      const lower = trimmed.toLowerCase();
      if (['home', 'jobs', 'careers', 'about', 'contact', 'sign in', 'log in', 'sign up', 'register', 'menu', 'navigation', 'search', 'filter'].includes(lower)) {
        return false;
      }
    }

    return true;
  });
  return filtered.join('\n');
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function inferLocationType(text: string): LocationType | null {
  const t = text.toLowerCase();
  if (t.includes("remote")) return "remote";
  if (t.includes("hybrid")) return "hybrid";
  if (t.includes("on-site") || t.includes("onsite")) return "on_site";
  return null;
}

function parseSalaryPerHour(text: string): number | null {
  const t = text.replace(/,/g, "");
  const re =
    /(?:\$|usd|eur|gbp)?\s*(\d{2,4})(?:\s*-\s*(\d{2,4}))?\s*(?:\/\s*hr|\/\s*hour|per\s*hour|hourly)\b/i;
  const m = t.match(re);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function extractHeuristics(html: string, text: string) {
  const title =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ??
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ??
    null;

  const h1 =
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
    null;

  const job_title = (
    (h1 ?? title ?? MANUAL_DEFAULTS.job_title) as string
  )
    .replace(/<\/?[^>]+(>|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    || MANUAL_DEFAULTS.job_title;

  const companyCandidate =
    html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ??
    html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ??
    null;

  const company_name =
    (companyCandidate?.trim() ?? MANUAL_DEFAULTS.company_name) ||
    MANUAL_DEFAULTS.company_name;

  const location_type = inferLocationType(text);
  const salary_per_hour = parseSalaryPerHour(text);

  const location =
    text.match(/Location\s*[:\-]\s*([^\n\r]{2,80})/i)?.[1]?.trim() ??
    (location_type === "remote" ? "Remote" : null);

  const contact_person =
    text.match(/(?:Contact|Recruiter|Hiring Manager)\s*[:\-]\s*([^\n\r]{2,80})/i)?.[1]?.trim() ??
    null;

  return {
    company_name: company_name || null,
    job_title: job_title || null,
    compensation_amount: salary_per_hour,
    salary_type: salary_per_hour != null ? "hourly" : null,
    location_type,
    location: location ?? null,
    contact_person,
    notes: null as string | null,
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}



async function extractWithAI(truncatedText: string) {
  return await parseJobPage(truncatedText);
}

export async function POST(request: NextRequest) {
  let body: AutoImportBody;
  try {
    body = (await request.json()) as AutoImportBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const jobUrl = typeof body?.job_url === "string" ? body.job_url.trim() : "";
  const pastedText = typeof body?.pasted_text === "string" ? body.pasted_text.trim() : "";

  if (!jobUrl && !pastedText) {
    return NextResponse.json(
      { error: "Missing job_url or pasted_text." },
      { status: 400 },
    );
  }

  let text = "";
  let safeHtml = "";
  let normalizedJobUrl: string | null = null;

  if (pastedText) {
    text = truncate(cleanPastedText(pastedText), MAX_TEXT_CHARS);
  } else {
    normalizedJobUrl = normalizeHttpUrl(jobUrl);
    if (!normalizedJobUrl) {
      return NextResponse.json(
        { error: "Missing or invalid job_url." },
        { status: 400 },
      );
    }

    let htmlResp: Response;
    try {
      htmlResp = await fetchWithTimeout(
        normalizedJobUrl,
        {
          method: "GET",
          redirect: "follow",
          headers: { "user-agent": USER_AGENT },
        },
        FETCH_TIMEOUT_MS,
      );
    } catch (err: any) {
      return NextResponse.json(
        { error: `Fetch failed: ${err?.message || "Unknown error"}.` },
        { status: 400 },
      );
    }

    if (!htmlResp.ok) {
      return NextResponse.json(
        { error: `Fetch failed. (Status ${htmlResp.status}). Web page may be protected. Try the 'Paste Text' tab.` },
        { status: 400 },
      );
    }

    const html = await htmlResp.text();
    safeHtml = html.slice(0, MAX_HTML_CHARS);
    text = truncate(stripHtmlToText(safeHtml), MAX_TEXT_CHARS);
  }

  const jobKeywords = [
    "apply", "requirements", "qualifications", "responsibilities",
    "experience", "resume", "salary", "compensation", "benefits",
    "equal opportunity", "skills", "full-time", "part-time", "contract", "degree"
  ];
  const textLower = text.toLowerCase();
  const matchCount = jobKeywords.filter(kw => textLower.includes(kw)).length;

  if (matchCount < 2) {
    return NextResponse.json(
      { error: "Not a valid job posting (failed keyword check)." },
      { status: 400 }
    );
  }

  const modelExtraction = await extractWithAI(text);
  const heuristics = extractHeuristics(safeHtml, text);

  const extracted: ExtractionFields = {
    company_name: modelExtraction?.company_name ?? heuristics.company_name,
    job_title: modelExtraction?.job_title ?? heuristics.job_title,
    compensation_amount: modelExtraction?.compensation_amount ?? heuristics.compensation_amount,
    salary_type: modelExtraction?.salary_type ?? heuristics.salary_type,
    location_type: modelExtraction?.location_type ?? heuristics.location_type,
    location: modelExtraction?.location ?? heuristics.location,
    contact_person: modelExtraction?.contact_person ?? heuristics.contact_person,
    notes: modelExtraction?.notes ?? heuristics.notes,
  };

  const date_applied = new Date().toISOString().slice(0, 10);
  const status = MANUAL_DEFAULTS.status;

  const locationTypeRaw = extracted.location_type;
  const location_type: LocationType | null =
    locationTypeRaw === "remote" ||
      locationTypeRaw === "hybrid" ||
      locationTypeRaw === "on_site"
      ? (locationTypeRaw as LocationType)
      : null;

  const compensationRaw = extracted.compensation_amount;
  const safeSalary =
    typeof compensationRaw === "number" && Number.isFinite(compensationRaw)
      ? compensationRaw
      : typeof compensationRaw === "string" && Number.isFinite(Number(compensationRaw))
        ? Number(compensationRaw)
        : null;

  const salaryTypeRaw = extracted.salary_type;
  const salary_type: SalaryType | null =
    salaryTypeRaw === "hourly" ||
      salaryTypeRaw === "weekly" ||
      salaryTypeRaw === "biweekly" ||
      salaryTypeRaw === "monthly" ||
      salaryTypeRaw === "yearly"
      ? (salaryTypeRaw as SalaryType)
      : safeSalary != null
        ? "yearly"
        : MANUAL_DEFAULTS.salary_type;

  const row = {
    company_name:
      typeof extracted.company_name === "string" && extracted.company_name.trim()
        ? extracted.company_name.trim()
        : MANUAL_DEFAULTS.company_name,
    job_title:
      typeof extracted.job_title === "string" && extracted.job_title.trim()
        ? extracted.job_title.trim()
        : MANUAL_DEFAULTS.job_title,
    compensation_amount: safeSalary,
    salary_type,
    location_type,
    location:
      typeof extracted.location === "string" && extracted.location.trim()
        ? extracted.location.trim()
        : null,
    date_applied,
    contact_person:
      typeof extracted.contact_person === "string" && extracted.contact_person.trim()
        ? extracted.contact_person.trim()
        : null,
    status,
    notes:
      typeof extracted.notes === "string" && extracted.notes.trim()
        ? extracted.notes.trim()
        : null,
  };

  const isJobPosting = modelExtraction?.is_job_posting ?? true;

  if (!isJobPosting || row.company_name === MANUAL_DEFAULTS.company_name || row.job_title === MANUAL_DEFAULTS.job_title) {
    const errorMsg = pastedText
      ? "Not a job posting or missing details. Enter manually."
      : "Not a job posting or missing details. Try 'Paste Text' or enter manually.";
    return NextResponse.json(
      { error: errorMsg },
      { status: 400 }
    );
  }

  const hasCompensation = row.compensation_amount != null && row.salary_type != null;
  if (!hasCompensation) {
    return NextResponse.json(
      { error: "No compensation detected. Please enter manually." },
      { status: 400 }
    );
  }

  const user = await getApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: parentRow, error: parentError } = await admin
    .from("applications")
    .insert({ user_id: user.id, job_url: normalizedJobUrl })
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

  const { data, error: insertError } = await admin
    .from("application_current")
    .insert({ ...row, application_id: applicationId })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const sourceType = "scrape";
  const eventTime = new Date().toISOString();
  const initialEvents: Record<string, unknown>[] = [];

  initialEvents.push({
    application_id: applicationId,
    field_name: "status",
    source_type: sourceType,
    value_status: row.status,
    event_time: eventTime,
  });

  if (row.compensation_amount != null) {
    initialEvents.push({
      application_id: applicationId,
      field_name: "compensation_amount",
      source_type: sourceType,
      value_number: row.compensation_amount,
      event_time: eventTime,
    });
  }

  if (row.salary_type) {
    initialEvents.push({
      application_id: applicationId,
      field_name: "salary_type",
      source_type: sourceType,
      value_text: row.salary_type,
      event_time: eventTime,
    });
  }

  if (row.location_type) {
    initialEvents.push({
      application_id: applicationId,
      field_name: "location_type",
      source_type: sourceType,
      value_location_type: row.location_type,
      event_time: eventTime,
    });
  }

  if (row.location) {
    initialEvents.push({
      application_id: applicationId,
      field_name: "location",
      source_type: sourceType,
      value_text: row.location,
      event_time: eventTime,
    });
  }

  if (row.contact_person) {
    initialEvents.push({
      application_id: applicationId,
      field_name: "contact_person",
      source_type: sourceType,
      value_text: row.contact_person,
      event_time: eventTime,
    });
  }

  if (row.date_applied) {
    initialEvents.push({
      application_id: applicationId,
      field_name: "date_applied",
      source_type: sourceType,
      value_date: row.date_applied,
      event_time: eventTime,
    });
  }

  if (row.notes) {
    initialEvents.push({
      application_id: applicationId,
      field_name: "notes",
      source_type: sourceType,
      value_text: row.notes,
      event_time: eventTime,
    });
  }

  if (initialEvents.length > 0) {
    const { error: eventError } = await admin
      .from("application_field_events")
      .insert(initialEvents);

    if (eventError) {
      console.error("[auto-import] application_field_events insert failed:", eventError);
    }
  }

  return NextResponse.json(data);
}

