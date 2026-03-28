import { NextRequest, NextResponse } from "next/server";
import { requireCurrentAppOwner } from "@/lib/supabase/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const auth = await requireCurrentAppOwner(request, idNum);
  if (auth.errorResponse) return auth.errorResponse;
  const { admin, applicationId } = auth;

  const { data: events, error: eventsError } = await admin
    .from("application_field_events")
    .select("*")
    .eq("application_id", applicationId)
    .order("event_time", { ascending: false });

  if (eventsError) {
    return NextResponse.json(
      { error: eventsError.message },
      { status: 500 },
    );
  }

  return NextResponse.json(events ?? []);
}
