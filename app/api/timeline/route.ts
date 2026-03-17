import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/lib/supabase/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ApplicationFieldName,
  ApplicationStatus,
  Confidence,
  LocationType,
  SourceType,
} from "@/types/applications";

interface TimelineEventBody {
  application_id: number;
  source_type?: SourceType | null;
  email_id?: number | null;
  field_name: ApplicationFieldName;
  value_text?: string | null;
  value_number?: number | null;
  value_date?: string | null;
  value_location_type?: LocationType | null;
  value_status?: ApplicationStatus | null;
  event_time?: string;
  confidence?: number | null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const applicationIdParam = searchParams.get("application_id");

  const applicationId = applicationIdParam ? Number(applicationIdParam) : NaN;
  if (!Number.isInteger(applicationId)) {
    return NextResponse.json(
      { error: "Missing or invalid application_id" },
      { status: 400 },
    );
  }

  const user = await getApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: parent, error: parentError } = await admin
    .from("applications")
    .select("id, user_id")
    .eq("id", applicationId)
    .single();

  if (parentError || !parent) {
    return NextResponse.json(
      { error: "Application not found" },
      { status: 404 },
    );
  }

  if (parent.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await admin
    .from("application_field_events")
    .select("*")
    .eq("application_id", applicationId)
    .order("event_time", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  let body: TimelineEventBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const applicationId = Number(body.application_id);
  if (!Number.isInteger(applicationId)) {
    return NextResponse.json(
      { error: "application_id must be an integer" },
      { status: 400 },
    );
  }

  const user = await getApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: parent, error: parentError } = await admin
    .from("applications")
    .select("id, user_id")
    .eq("id", applicationId)
    .single();

  if (parentError || !parent) {
    return NextResponse.json(
      { error: "Application not found" },
      { status: 404 },
    );
  }

  if (parent.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = {
    application_id: applicationId,
    source_type: (body.source_type ?? "manual") as SourceType,
    email_id: body.email_id ?? null,
    field_name: body.field_name,
    value_text: body.value_text ?? null,
    value_number: body.value_number ?? null,
    value_date: body.value_date ?? null,
    value_location_type: body.value_location_type ?? null,
    value_status: body.value_status ?? null,
    event_time: body.event_time ?? new Date().toISOString(),
    confidence: body.confidence ?? null,
  };

  const { data, error } = await admin
    .from("application_field_events")
    .insert(row)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
