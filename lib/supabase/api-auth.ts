import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

export async function requireAuth(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) {
    return { errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const admin = createAdminClient();
  return { errorResponse: undefined, user, admin };
}

export async function requireAppOwner(request: NextRequest, applicationId: number) {
  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth;
  const { user, admin } = auth as { user: User; admin: ReturnType<typeof createAdminClient> };
  
  const { data: parent } = await admin
    .from("applications")
    .select("user_id")
    .eq("id", applicationId)
    .single();
    
  if (!parent) return { errorResponse: NextResponse.json({ error: "Application not found" }, { status: 404 }) };
  if (parent.user_id !== user.id) return { errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  
  return { errorResponse: undefined, user, admin };
}

export async function requireCurrentAppOwner(request: NextRequest, currentAppId: number) {
  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth;
  const { user, admin } = auth as { user: User; admin: ReturnType<typeof createAdminClient> };
  
  const { data: row } = await admin
    .from("application_current")
    .select("*")
    .eq("id", currentAppId)
    .single();
    
  if (!row) return { errorResponse: NextResponse.json({ error: "Application not found" }, { status: 404 }) };
  
  const { data: parent } = await admin
    .from("applications")
    .select("user_id")
    .eq("id", row.application_id)
    .single();
    
  if (!parent) return { errorResponse: NextResponse.json({ error: "Application not found" }, { status: 404 }) };
  if (parent.user_id !== user.id) return { errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  
  return { errorResponse: undefined, user, admin, row, applicationId: row.application_id };
}
