import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/supabase/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const user = await getApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: row, error: fetchError } = await admin
    .from("application_current")
    .select("application_id")
    .eq("id", idNum)
    .single();

  if (fetchError || !row) {
    return NextResponse.json(
      { error: "Application not found" },
      { status: 404 },
    );
  }

  const { data: parent } = await admin
    .from("applications")
    .select("user_id")
    .eq("id", row.application_id)
    .single();
  if (parent?.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: events, error: eventsError } = await admin
    .from("application_field_events")
    .select("*")
    .eq("application_id", row.application_id)
    .order("event_time", { ascending: false });

  if (eventsError) {
    return NextResponse.json(
      { error: eventsError.message },
      { status: 500 },
    );
  }

  return NextResponse.json(events ?? []);
}
