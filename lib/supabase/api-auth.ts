import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

/**
 * Resolves the authenticated user for API routes.
 * Checks for a Bearer token first (for Postman/scripts), then falls back to cookie session.
 */
export async function getApiUser(request: NextRequest): Promise<User | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

  if (token) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return null;
    const supabase = createSupabaseClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (!error && user) return user;
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!error && user) return user;

  return null;
}
