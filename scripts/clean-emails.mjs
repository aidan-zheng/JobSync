import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function cleanEmails() {
  console.log("Preparing to delete all emails and related application associations...");

  // 1. Delete application field events linked to emails
  const { error: eventErr } = await supabase
    .from("application_field_events")
    .delete()
    .not('email_id', 'is', null);

  if (eventErr) {
    console.error("Failed to delete application field events:", eventErr.message);
  } else {
    console.log("Cleared application_field_events.");
  }

  // 2. Delete application email links
  const { error: linkErr } = await supabase
    .from("application_email_links")
    .delete()
    .neq("id", 0);

  if (linkErr) {
    console.error("Failed to delete application email links:", linkErr.message);
  } else {
    console.log("Cleared application_email_links.");
  }

  // 3. Delete all emails
  const { error: emailErr } = await supabase
    .from("emails")
    .delete()
    .neq("id", 0); 

  if (emailErr) {
    console.error("Failed to delete emails:", emailErr.message);
  } else {
    console.log("Cleared emails table.");
  }

  console.log("\nDone! Database is clear for a fresh scan.");
}

cleanEmails();
