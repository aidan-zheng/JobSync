import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Dev-only endpoint that returns the current session's access token.
 * Log in via OAuth in the browser, then hit this URL to grab a token for Postman.
 */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    return NextResponse.json(
      { error: "Not signed in. Log in via OAuth first, then try again." },
      { status: 401 },
    );
  }

  return NextResponse.json({
    access_token: session.access_token,
    expires_at: session.expires_at,
    hint: "Authorization: Bearer " + session.access_token.slice(0, 20) + "...",
  });
}
