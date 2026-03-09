/**
 * Get a Supabase access token for API testing (Postman, curl, automated tests).
 * Usage: node scripts/get-api-token.mjs <email> <password>
 *
 * Only works if your app has email/password sign-in. If you use OAuth only (e.g. Google),
 * get a token by logging in at http://localhost:3000 then opening:
 *   http://localhost:3000/api/dev/token
 * and copying access_token for the Authorization header.
 *
 * Loads .env.local or .env from project root for Supabase URL/anon key.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        const val = m[2].replace(/^["']|["']$/g, "").trim();
        process.env[m[1]] = val;
      }
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY (set in .env or environment)");
  process.exit(1);
}

const email = process.argv[2];
const password = process.argv[3];
if (!email || !password) {
  console.error("Usage: node scripts/get-api-token.mjs <email> <password>");
  process.exit(1);
}

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const {
  data: { session },
  error,
} = await supabase.auth.signInWithPassword({ email, password });

if (error) {
  console.error("Sign in failed:", error.message);
  process.exit(1);
}

if (!session?.access_token) {
  console.error("No session returned");
  process.exit(1);
}

console.log("\nUse this in Postman or curl as:\n  Authorization: Bearer <token>\n");
console.log(session.access_token);
