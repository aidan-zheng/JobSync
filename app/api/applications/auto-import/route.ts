import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/supabase/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ApplicationStatus, LocationType } from "@/types/applications";

type AutoImportBody = {
  job_url?: string | null;
};

type ExtractionFields = {
  company_name?: unknown;
  job_title?: unknown;
  salary_per_hour?: unknown;
  location_type?: unknown;
  location?: unknown;
  contact_person?: unknown;
  notes?: unknown;
};

type UrlCheckerHandlers = {
  link?: (result: unknown, customData?: unknown) => void;
  end?: () => void;
};

type BrokenLinkCheckerModule = {
  UrlChecker: new (options: unknown, handlers: UrlCheckerHandlers) => {
    enqueue: (
      url: string,
      baseUrl?: string,
      customData?: unknown,
    ) => unknown;
  };
};

const MANUAL_DEFAULTS = {
  company_name: "Company",
  job_title: "Job Title",
  salary_per_hour: null as number | null,
  location_type: null as LocationType | null,
  location: null as string | null,
  contact_person: null as string | null,
  status: "applied" as ApplicationStatus,
  notes: null as string | null,
};

const USER_AGENT = "JobSync/auto-import (contact: dev@example.com)";
const MAX_HTML_CHARS = 300_000;
const MAX_TEXT_CHARS = 12_000;
const CHECKER_TIMEOUT_MS = 4_000;
const FETCH_TIMEOUT_MS = 15_000;

function normalizeHttpUrl(input: string): string | null {
  try {
    const u = new URL(input);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
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
    salary_per_hour,
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

async function checkUrlReachability(
  url: string,
): Promise<{ broken: boolean; brokenReason?: string }> {
  return await new Promise((resolve) => {
    let settled = false;
    let broken = true;
    let brokenReason: string | undefined;

    const finish = (result: {
      broken: boolean;
      brokenReason?: string;
    }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timeoutId = setTimeout(() => {
      finish({ broken: true, brokenReason: "TIMEOUT" });
    }, CHECKER_TIMEOUT_MS);

    void (async () => {
      try {
        const mod = (await import("broken-link-checker")) as unknown as
          BrokenLinkCheckerModule;

        const urlChecker = new mod.UrlChecker(
          {
            acceptedSchemes: ["http", "https"],
            requestMethod: "get",
            cacheResponses: false,
            maxSockets: 1,
            maxSocketsPerHost: 1,
            rateLimit: 0,
            honorRobotExclusions: true,
          },
          {
            link: (result: unknown) => {
              if (typeof result !== "object" || result === null) return;
              const maybeBroken = (result as { broken?: unknown }).broken;
              if (maybeBroken === true) broken = true;
              else if (maybeBroken === false) broken = false;

              const maybeReason = (result as {
                brokenReason?: unknown;
              }).brokenReason;
              if (typeof maybeReason === "string") brokenReason = maybeReason;
            },
            end: () => {
              clearTimeout(timeoutId);
              finish({ broken, brokenReason });
            },
          },
        );

        urlChecker.enqueue(url, url);
      } catch {
        clearTimeout(timeoutId);
        finish({ broken: true, brokenReason: "CHECKER_FAILED" });
      }
    })();
  });
}

async function extractWithAI(_truncatedText: string) {
  /**
   * AI extraction hook (currently stubbed).
   *
   * Input: `_truncatedText` is plain text derived from the fetched HTML:
   * - scripts/styles/tags stripped
   * - truncated to `MAX_TEXT_CHARS`
   *
   * Expected output: return an `ExtractionFields`-shaped object or `null`.
   */
  void _truncatedText;
  return null;
}

export async function POST(request: NextRequest) {
  let body: AutoImportBody;
  try {
    body = (await request.json()) as AutoImportBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const jobUrl = typeof body?.job_url === "string" ? body.job_url.trim() : "";
  const normalizedJobUrl = jobUrl ? normalizeHttpUrl(jobUrl) : null;
  if (!normalizedJobUrl) {
    return NextResponse.json(
      { error: "Missing or invalid job_url (http/https required)." },
      { status: 400 },
    );
  }

  const checker = await checkUrlReachability(normalizedJobUrl);

  const htmlResp = await fetchWithTimeout(
    normalizedJobUrl,
    {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": USER_AGENT },
    },
    FETCH_TIMEOUT_MS,
  );

  if (!htmlResp.ok) {
    return NextResponse.json(
      {
        error: `Failed to fetch job page (status ${htmlResp.status}).`,
        checker_reason: checker.brokenReason ?? null,
        checker_broken: checker.broken,
      },
      { status: 400 },
    );
  }

  const html = await htmlResp.text();
  const safeHtml = html.slice(0, MAX_HTML_CHARS);

  const text = truncate(stripHtmlToText(safeHtml), MAX_TEXT_CHARS);

  const modelExtraction = await extractWithAI(text);
  const heuristics = extractHeuristics(safeHtml, text);

  const extracted = (modelExtraction ?? heuristics) as ExtractionFields;

  const date_applied = new Date().toISOString().slice(0, 10);
  const status = MANUAL_DEFAULTS.status;

  const locationTypeRaw = extracted.location_type;
  const location_type: LocationType | null =
    locationTypeRaw === "remote" ||
    locationTypeRaw === "hybrid" ||
    locationTypeRaw === "on_site"
      ? (locationTypeRaw as LocationType)
      : null;

  const salaryRaw = extracted.salary_per_hour;
  const salaryPerHourRaw =
    typeof salaryRaw === "number" ? salaryRaw : null;
  const salaryPerHourFromString =
    typeof salaryRaw === "string" ? Number(salaryRaw) : null;
  const safeSalary =
    Number.isFinite(salaryPerHourRaw)
      ? salaryPerHourRaw
      : Number.isFinite(salaryPerHourFromString)
        ? salaryPerHourFromString
        : null;

  const row = {
    company_name:
      typeof extracted.company_name === "string" && extracted.company_name.trim()
        ? extracted.company_name.trim()
        : MANUAL_DEFAULTS.company_name,
    job_title:
      typeof extracted.job_title === "string" && extracted.job_title.trim()
        ? extracted.job_title.trim()
        : MANUAL_DEFAULTS.job_title,
    salary_per_hour: safeSalary,
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

  if (row.salary_per_hour != null) {
    initialEvents.push({
      application_id: applicationId,
      field_name: "salary_per_hour",
      source_type: sourceType,
      value_number: row.salary_per_hour,
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

