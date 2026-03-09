import { NextRequest, NextResponse } from "next/server";

// TODO: fetch emails from Supabase by application_id query param
export async function GET(_request: NextRequest) {
  return NextResponse.json({ message: "Not implemented" }, { status: 501 });
}

// TODO: validate body and insert into application_emails
export async function POST(_request: NextRequest) {
  return NextResponse.json({ message: "Not implemented" }, { status: 501 });
}
