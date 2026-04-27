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
  reason: string;
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

  const systemPrompt = `You are an AI assistant that determines whether emails are related to job applications.
You will be given a list of emails (subject, sender, and a short body snippet) and a list of the user's tracked job applications.

Respond ONLY with a JSON object containing a "results" array. You MUST return exactly one object for EACH email in the input list.
Each object in the array MUST have:
- "messageId": string — exactly matching the ID provided
- "relevant": boolean — true if the email is about a job application update (status change, interview invite, rejection, offer, etc.)
- "matched_application_id": number or null — the ID of the matching application if found, or null if relevance is unclear or no match
- "confidence": "high" | "medium" | "low" — how confident you are
- "reason": string — brief explanation

Rules:
- CRITICAL: You must evaluate EACH email INDEPENDENTLY against the list of tracked job applications.
- You MUST return exactly one result object in the array for EACH email provided in the input list. Use the exact "messageId" for each.
- Ensure you match each email to the CORRECT job application. Do NOT apply the same matched_application_id to all emails unless they truly belong to the same application.
- If an email is unequivocally from or about a company that is NOT on the user's tracked list, you MUST mark it as irrelevant ("relevant": false) and "matched_application_id": null. Do not force a match.
- Common relevant emails: interview invitations, application confirmations, rejections, offer letters.
- Common irrelevant emails: marketing, newsletters, personal emails, receipts.`;

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
        confidence: "low",
        reason: "LLM missed this email in response"
      };
    });
  } catch (err) {
    console.error(`[Stage 1] Failed to parse LLM JSON:`, err, "\nRaw output:", raw);
    return emails.map(e => ({
      messageId: e.messageId,
      relevant: false,
      matched_application_id: null,
      confidence: "low",
      reason: "Failed to parse LLM response"
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

  const systemPrompt = `You are an AI assistant that extracts structured job application updates from email content.
Given an email about a job application, extract any field updates.

Return ONLY a JSON object with these fields (set to null if not mentioned/changed):
- "status": one of "draft", "applied", "interviewing", "offer", "rejected", "withdrawn", "ghosted" — or null if no status change detected
- "compensation_amount": number or null — the compensation value if mentioned
- "salary_type": one of "hourly", "weekly", "biweekly", "monthly", "yearly" — or null if no compensation is mentioned
- "location_type": one of "remote", "hybrid", "on_site" — or null
- "location": string or null — city/office location if mentioned
- "contact_person": string or null — recruiter or hiring manager name. ONLY extract this if a person explicitly introduces themselves or signs off in the email body. DO NOT guess it from the sender email address.
- "notes": string or null — any other important details worth noting (interview date/time, next steps, etc.). Keep this concise (1-2 lines). 

Rules:
- CRITICAL: If the email is clearly focused on a different company than "${currentApplication.company_name}", you MUST assume this email is irrelevant and return null for ALL fields to prevent false positive updates.
- If the email is an interview invitation → status should be "interviewing"
- If it's a rejection → status should be "rejected"
- If it's an offer → status should be "offer"
- If it's an application confirmation → status should be "applied"
- Only extract fields that are clearly stated in the email.
- The current application status is "${currentApplication.status}". Only change it if the email clearly indicates a different status.`;

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
