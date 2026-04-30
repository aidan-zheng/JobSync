/**
 * Two-stage LLM parsing engine using Groq API.
 *
 * Stage 1: Relevance check (subject + sender only)
 * Stage 2: Body parsing (extracts structured field updates)
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const BODY_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3-32b"
];

const HEADER_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant"
];

class GroqApiError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`Groq API error ${status}: ${body}`);
    this.status = status;
  }
}

function getApiKeys(): string[] {
  const keys = Object.keys(process.env)
    .filter((k) => k.startsWith("GROQ_API_KEY"))
    .sort()
    .map((k) => process.env[k])
    .filter(Boolean) as string[];

  if (keys.length === 0) {
    throw new Error("Missing GROQ_API_KEY environment variable(s)");
  }

  // key shuffle for rate limits
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }

  return keys;
}

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callGroq(messages: GroqMessage[], model: string, apiKey: string): Promise<string> {
  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      max_tokens: 1024,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new GroqApiError(res.status, text);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "{}";
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function callGroqWithRetry(messages: GroqMessage[], type: "body" | "header"): Promise<string> {
  const models = type === "body" ? BODY_MODELS : HEADER_MODELS;
  const keys = getApiKeys();
  const MAX_CYCLES = 10;

  for (let cycle = 0; cycle < MAX_CYCLES; cycle++) {
    let anyRateLimited = false;

    for (const model of models) {
      let modelUnavailable = false;

      for (const key of keys) {
        try {
          return await callGroq(messages, model, key);
        } catch (err) {
          if (err instanceof GroqApiError) {
            if (err.status === 429) {
              anyRateLimited = true;
              console.warn(`[LLM] ${model} rate limited, trying next key...`);
              continue;
            }
            if (err.status === 400 || err.status === 404) {
              console.warn(`[LLM] ${model} unavailable (${err.status}), skipping model...`);
              modelUnavailable = true;
              break;
            }
          }
          throw err;
        }
      }

      if (modelUnavailable) continue;
    }

    if (!anyRateLimited) break;

    console.warn(`[LLM] All ${type} models rate limited. Cycle ${cycle + 1}/${MAX_CYCLES}. Waiting 2s...`);
    await sleep(2000);
  }

  throw new Error(`All ${type} Groq models exhausted or unavailable after ${MAX_CYCLES} retry cycles.`);
}

function extractJson(raw: string): any {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return JSON.parse(cleaned.trim());
}

// Stage 1: Relevance Check 

export interface BatchRelevanceResult {
  messageId: string;
  relevant: boolean;
  matched_application_id: number | null;
  confidence: "high" | "medium" | "low";
}

/**
 * Stage 1: Check if emails are relevant to any tracked job application.
 * Batch processes multiple emails at once using header models.
 */
export async function checkRelevanceBatch(
  emails: { messageId: string; subject: string; sender: string; snippet?: string }[],
  applications: { application_id: number; company_name: string; job_title: string }[],
): Promise<BatchRelevanceResult[]> {
  if (emails.length === 0) return [];

  const appList = applications
    .map((a) => `  - ID: ${a.application_id}, Company: "${a.company_name}", Role: "${a.job_title}"`)
    .join("\n");

  const emailList = emails
    .map((e) => `ID: ${e.messageId}\nSubject: "${e.subject}"\nSender: "${e.sender}"\nSnippet: "${e.snippet ? e.snippet.replace(/\n/g, ' ') : ''}"\n---`)
    .join("\n");

  const systemPrompt = `You are a job application relevance filter. Match emails to tracked applications.
Return a JSON object: { "results": [{"messageId": string, "relevant": boolean, "matched_application_id": number|null, "confidence": "high"|"medium"|"low"}] }
Rules:
1. Evaluate each email independently. Match exactly one object per incoming email ID.
2. Set "relevant": true only for core updates (interview invites, offers, rejections, application confirmations).
3. "matched_application_id" requires a high certainty company match. Scan email body snippets and standard signature/footer areas carefully for company identity.
4. Set "relevant": false for newsletters, personal email, marketing, or general spam.`;

  const userPrompt = `User's tracked job applications:
${appList || "  (No applications tracked yet)"}

Emails to analyze:
${emailList}`;

  const raw = await callGroqWithRetry([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], "header");

  try {
    const parsed = extractJson(raw);
    const results = parsed.results || [];
    return emails.map(e => {
      const found = results.find((r: any) => r.messageId === e.messageId);
      if (found) return found;
      return {
        messageId: e.messageId,
        relevant: false,
        matched_application_id: null,
        confidence: "low"
      };
    });
  } catch (err) {
    console.error(`[Stage 1] Failed to parse LLM JSON:`, err, "\nRaw output:", raw);
    return emails.map(e => ({
      messageId: e.messageId,
      relevant: false,
      matched_application_id: null,
      confidence: "low"
    }));
  }
}

// Stage 2: Body Parsing 

export interface ParsedEmailUpdate {
  status: string | null;
  compensation_amount: number | null;
  salary_type: string | null;
  location_type: string | null;
  location: string | null;
  contact_person: string | null;
  notes: string | null;
  confidence: "high" | "medium" | "low";
}

/**
 * Stage 2: Parse the email body to extract structured job application update fields.
 * Only called when Stage 1 determines the email is relevant.
 */
export async function parseEmailBody(
  subject: string,
  sender: string,
  body: string,
  currentApplication: {
    company_name: string;
    job_title: string;
    status: string;
    contact_person?: string | null;
    notes?: string | null;
  },
): Promise<ParsedEmailUpdate> {
  // Truncate very long bodies to avoid token limits
  const truncatedBody = body.length > 4000 ? body.slice(0, 4000) + "\n[...truncated]" : body;

  const systemPrompt = `Extract structured job application updates for "${currentApplication.company_name}" (current status: "${currentApplication.status}").
Return ONLY a JSON object:
- "status": "draft"|"applied"|"interviewing"|"offer"|"rejected"|"withdrawn"|"ghosted"|null
- "compensation_amount": number|null
- "salary_type": "hourly"|"weekly"|"biweekly"|"monthly"|"yearly"|null
- "location_type": "remote"|"hybrid"|"on_site"|null
- "location": string|null
- "contact_person": explicit recruiter/manager name only (do not guess from email)
- "notes": 1-2 line logistical context (next steps, dates)
- "confidence": "high"|"medium"|"low"
Rules:
1. If focusing on a mismatched company, set all updates to null.
2. Infer status safely (confirmations->applied, rejections->rejected, invites->interviewing, offers->offer).`;

  const userPrompt = `Application: ${currentApplication.company_name} — ${currentApplication.job_title} (current status: ${currentApplication.status})

Email Subject: "${subject}"
Email From: "${sender}"

Email Body:
${truncatedBody}`;

  const raw = await callGroqWithRetry([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], "body");

  try {
    const parsed = extractJson(raw);

    let contact_person = parsed.contact_person ?? null;
    if (
      contact_person &&
      currentApplication.contact_person &&
      contact_person.trim().toLowerCase() === currentApplication.contact_person.trim().toLowerCase()
    ) {
      contact_person = null; // Do not trigger an update if it's the same name
    }

    return {
      status: parsed.status ? parsed.status.toLowerCase() : null,
      compensation_amount: parsed.compensation_amount != null ? Number(parsed.compensation_amount) : null,
      salary_type: parsed.salary_type ? parsed.salary_type.toLowerCase() : null,
      location_type: parsed.location_type ? parsed.location_type.toLowerCase() : null,
      location: parsed.location ?? null,
      contact_person: contact_person,
      notes: parsed.notes ?? null,
      confidence: parsed.confidence ? parsed.confidence.toLowerCase() : "medium",
    };
  } catch (err) {
    console.error(`[Stage 2] Failed to parse LLM JSON:`, err, "\nRaw output:", raw);
    return {
      status: null,
      compensation_amount: null,
      salary_type: null,
      location_type: null,
      location: null,
      contact_person: null,
      notes: null,
      confidence: "low" as const,
    };
  }
}

/**
 * Job Scraping Extractor for the automated job importer
 */
export async function parseJobPage(text: string): Promise<{
  is_job_posting: boolean;
  company_name: string | null;
  job_title: string | null;
  location: string | null;
  location_type: string | null;
  compensation_amount: number | null;
  salary_type: string | null;
  contact_person: string | null;
  notes: string | null;
} | null> {
  const systemPrompt = `You are an assistant that extracts details from job postings.
Return ONLY a JSON object (all null if unknown):
- "is_job_posting": boolean
- "company_name": string or null
- "job_title": string or null
- "location": string or null (Format: City, ST)
- "location_type": "remote"|"hybrid"|"on_site"|null
- "compensation_amount": number or null (0 for explicitly unpaid roles)
- "salary_type": "hourly"|"weekly"|"biweekly"|"monthly"|"yearly"|null
- "contact_person": string or null
- "notes": string or null (concise 1-2 lines on qualifications)`;

  const userPrompt = `Job Posting Text:
${text}`;

  const raw = await callGroqWithRetry([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], "body");

  try {
    const parsed = extractJson(raw);
    return {
      is_job_posting: parsed.is_job_posting ?? false,
      company_name: parsed.company_name ?? null,
      job_title: parsed.job_title ?? null,
      location: parsed.location ?? null,
      location_type: parsed.location_type ?? null,
      compensation_amount: parsed.compensation_amount != null ? Number(parsed.compensation_amount) : null,
      salary_type: parsed.salary_type ?? null,
      contact_person: parsed.contact_person ?? null,
      notes: parsed.notes ?? null,
    };
  } catch (err) {
    console.error(`[Scraper Parsing] Failed to parse LLM JSON:`, err, "\nRaw:", raw);
    return null;
  }
}
