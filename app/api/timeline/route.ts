import { NextRequest, NextResponse } from "next/server";

// TODO: fetch timeline events from Supabase by application_id
export async function GET(_request: NextRequest) {
  return NextResponse.json({ message: "Not implemented" }, { status: 501 });
}

// TODO: validate body and insert into timeline_events
export async function POST(_request: NextRequest) {
  return NextResponse.json({ message: "Not implemented" }, { status: 501 });
}
