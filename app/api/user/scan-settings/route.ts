import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;
  const { user, admin } = auth;

  const { data, error } = await admin
    .from("user_scan_preferences")
    .select("auto_scan_enabled, scan_window_start, last_scan_time, preferred_scan_hour")
    .eq("user_id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("[scan-settings GET]", error);
    return NextResponse.json({ error: "Failed to fetch scan settings" }, { status: 500 });
  }

  return NextResponse.json({
    auto_scan_enabled: data?.auto_scan_enabled ?? false,
    scan_window_start: data?.scan_window_start ?? null,
    last_scan_time: data?.last_scan_time ?? null,
    preferred_scan_hour: data?.preferred_scan_hour ?? 8,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;
  const { user, admin } = auth;

  let body: {
    auto_scan_enabled?: boolean;
    scan_window_start?: string | null;
    preferred_scan_hour?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };

  if (typeof body.auto_scan_enabled === "boolean") {
    update.auto_scan_enabled = body.auto_scan_enabled;
  }
  if ("scan_window_start" in body) {
    update.scan_window_start = body.scan_window_start ?? null;
  }
  if (typeof body.preferred_scan_hour === "number" && body.preferred_scan_hour >= 0 && body.preferred_scan_hour <= 23) {
    update.preferred_scan_hour = body.preferred_scan_hour;
  }

  const { error } = await admin
    .from("user_scan_preferences")
    .upsert(update, { onConflict: "user_id" });

  if (error) {
    console.error("[scan-settings POST]", error);
    return NextResponse.json({ error: "Failed to save scan settings" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
