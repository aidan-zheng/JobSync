/**
 * Gmail API client for fetching emails in a date range.
 * Uses the user's Google OAuth provider token.
 */

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailMessage {
  messageId: string;
  from: string;
  subject: string;
  date: string;
  body: string;
}

/**
 * List Gmail message IDs matching a date range query.
 */
async function listMessageIds(
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<string[]> {
  // Gmail search query uses after: and before: with epoch seconds
  const after = Math.floor(new Date(startDate).getTime() / 1000);
  const before = Math.floor(new Date(endDate + "T23:59:59").getTime() / 1000);
  const query = `after:${after} before:${before} -category:promotions -category:social`;

  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${GMAIL_API_BASE}/messages`);
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gmail API list error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const messages = data.messages as { id: string }[] | undefined;
    if (messages) {
      ids.push(...messages.map((m) => m.id));
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return ids;
}

/**
 * Decode base64url-encoded string (Gmail uses URL-safe base64).
 */
function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf-8");
}

/**
 * Extract header value by name from Gmail message headers.
 */
function getHeader(
  headers: { name: string; value: string }[],
  name: string,
): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function cleanEmailBody(text: string): string {
  const lines = text.split(/\r?\n/);
  const keepLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Gmail reply header: "On Date, Name <email> wrote:"
    if (/^On\s+.+wrote:\s*$/.test(line)) break;

    // Outlook generic dividers "--- Original Message ---" or "___"
    if (/^[-_]{3,}\s*(Original Message)?\s*[-_]{3,}$/i.test(line)) break;

    // Outlook block header
    if (/^From:\s+.+$/i.test(line) && /^Sent:\s+.+$/i.test(lines[i + 1]?.trim() || "")) {
      break;
    }

    keepLines.push(lines[i]);
  }

  return keepLines.join("\n").trim();
}

function extractBody(payload: Record<string, unknown>): string {
  // Collect all parts deeply
  function getAllParts(p: Record<string, unknown>): Record<string, unknown>[] {
    let all: Record<string, unknown>[] = [p];
    const parts = p.parts as Record<string, unknown>[] | undefined;
    if (parts && Array.isArray(parts)) {
      for (const child of parts) {
        all = all.concat(getAllParts(child));
      }
    }
    return all;
  }

  const allParts = getAllParts(payload);

  // 1. Try to find a direct text/plain part with data
  for (const part of allParts) {
    if (part.mimeType === "text/plain") {
      const data = (part.body as { data?: string })?.data;
      if (data) return cleanEmailBody(decodeBase64Url(data));
    }
  }

  // 2. Try to find text/html part with data
  for (const part of allParts) {
    if (part.mimeType === "text/html") {
      const data = (part.body as { data?: string })?.data;
      if (data) {
        let html = decodeBase64Url(data);
        const quoteIndex = html.indexOf('class="gmail_quote"');
        if (quoteIndex !== -1) {
           const divIndex = html.lastIndexOf('<div', quoteIndex);
           const blockIndex = html.lastIndexOf('<blockquote', quoteIndex);
           const cutIndex = Math.max(divIndex, blockIndex);
           if (cutIndex !== -1) html = html.substring(0, cutIndex);
        }
        let plain = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        return cleanEmailBody(plain);
      }
    }
  }

  // 3. Fallback to basic payload body data
  const bodyData = (payload.body as { data?: string })?.data;
  if (bodyData) {
    return cleanEmailBody(decodeBase64Url(bodyData));
  }

  return "";
}

/**
 * Fetch a single Gmail message by ID.
 */
export async function getMessage(
  accessToken: string,
  messageId: string,
): Promise<GmailMessage> {
  const res = await fetch(`${GMAIL_API_BASE}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail API get error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const headers = data.payload?.headers ?? [];
  let bodyStr = extractBody(data.payload ?? {});
  
  if (!bodyStr && data.snippet) {
    bodyStr = data.snippet; // Fallback to snippet if body extraction fails
  }

  return {
    messageId,
    from: getHeader(headers, "From"),
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date"),
    body: bodyStr,
  };
}

/**
 * Fetch all Gmail messages in a date range.
 * Returns an array of parsed messages with subject, sender, date, and body.
 */
export async function fetchGmailMessages(
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<GmailMessage[]> {
  const ids = await listMessageIds(accessToken, startDate, endDate);

  // Fetch messages in parallel (batches of 10 to avoid rate limits)
  const messages: GmailMessage[] = [];
  const batchSize = 10;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((id) => getMessage(accessToken, id)),
    );
    messages.push(...results);
  }

  return messages;
}

/**
 * Refresh a Google Access Token using the user's refresh token.
 */
export async function refreshGoogleAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
  }

  const url = "https://oauth2.googleapis.com/token";
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to refresh Google token (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token as string,
    expires_in: data.expires_in as number,     // seconds
    refresh_token: data.refresh_token as string | undefined, // sometimes returned, sometimes not
  };
}

/**
 * Retrieves a valid Google access token for a user.
 * If the current token is near expiration and a refresh token is available,
 * it will automatically refresh the token and update the database.
 */
export async function getValidGoogleToken(admin: any, userId: string): Promise<string> {
  const { data: tokenRow, error: tokenErr } = await admin
    .from("user_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .single();

  if (tokenErr || !tokenRow?.access_token) {
    throw new Error("NO_TOKEN");
  }

  let accessToken = tokenRow.access_token;
  
  // If we have an expiration date, check if it's within 5 minutes of expiring
  if (tokenRow.expires_at) {
    const expiresAt = new Date(tokenRow.expires_at).getTime();
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      if (tokenRow.refresh_token) {
        try {
          const newTokens = await refreshGoogleAccessToken(tokenRow.refresh_token);
          accessToken = newTokens.access_token;
          
          await admin.from("user_tokens").update({
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token || tokenRow.refresh_token,
            expires_at: newTokens.expires_in ? new Date(Date.now() + newTokens.expires_in * 1000).toISOString() : tokenRow.expires_at,
            updated_at: new Date().toISOString(),
          }).eq("user_id", userId).eq("provider", "google");
        } catch (refreshErr) {
          console.error("Preemptive token refresh failed:", refreshErr);
          throw new Error("TOKEN_EXPIRED");
        }
      } else {
        throw new Error("TOKEN_EXPIRED");
      }
    }
  }

  return accessToken;
}
