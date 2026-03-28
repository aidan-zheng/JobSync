# JobSync

A job application tracker built with Next.js and Supabase. Track applications, log field changes over time, sync with Gmail via AI parsing, and keep everything in one place.

## Tech Stack

- **Next.js 16** (App Router) — React 19, TypeScript
- **Supabase** — Auth (GitHub + Google OAuth), Postgres database
- **Groq API** — AI-powered email parsing (Stage 1 relevance check, Stage 2 body parsing)
- **Tailwind CSS 4** + **shadcn/ui** — styling and UI primitives
- **Framer Motion** — page transitions and micro-animations
- **OGL** — WebGL gradient background (`Grainient` component)
- **react-resizable-panels** — resizable three-panel dashboard layout

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set up environment variables**

   Copy `.env.example` (or create `.env`) with:

   ```
   NEXT_PUBLIC_SUPABASE_URL=<your supabase project url>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
   SUPABASE_SERVICE_ROLE_KEY=<your service role key>
   GROQ_API_KEY=<your groq api key>
   GOOGLE_CLIENT_ID=<your google oauth client id>
   GOOGLE_CLIENT_SECRET=<your google oauth client secret>
   ```

3. **Set up the database**

   Run these SQL files in the Supabase SQL Editor (in order):

   - `supabase-user-tokens.sql` — stores OAuth access/refresh tokens
   - `supabase-rls-application-current.sql` — RLS policies for `application_current`
   - `supabase-application-field-events.sql` — creates the `application_field_events` table and enums

   The database schema is three main tables:
   - **`applications`** — parent table for tracking applications, holds `user_id` and optional `job_url`
   - **`application_current`** — holds all current job fields (company, title, salary, status, etc.), linked via `application_id`
   - **`application_field_events`** — logs every field change over time (source, value, timestamp) for the timeline view

4. **Configure OAuth providers**

   In your Supabase dashboard, enable GitHub and Google as auth providers. Set the redirect URL to `http://localhost:3000/auth/callback`.

5. **Run the dev server**

   ```bash
   npm run dev
   ```

## Project Structure

```
app/
├── (auth)/login/                   # OAuth login (GitHub / Google)
├── auth/callback/route.ts          # OAuth callback handler
├── dashboard/
│   ├── page.tsx                    # Main dashboard with resizable panels
│   ├── dashboard.module.css
│   └── components/
│       ├── ApplicationsList.tsx    # List panel (search, filter, bulk delete)
│       ├── ApplicationDetails.tsx  # Central detail panel with inline edits
│       ├── EmailsTimeline.tsx      # Chronological timeline of events/emails
│       ├── NewApplicationModal.tsx # Manual/Automatic application creation
│       └── ScanEmailsModal.tsx     # AI email scanner UI
├── api/
│   ├── applications/               # CRUD for applications and events
│   ├── emails/                     # Linking and unlinking scanned emails
│   ├── scan-emails/
│   │   ├── route.ts                # Stage 1: Batch relevance check
│   │   └── process/route.ts        # Stage 2: Deep parsing + DB update
│   └── dev/token/route.ts          # Dev utility to grab session tokens
lib/
├── applications.ts                 # Core business logic (state recalculation, event dispatch)
├── gmail.ts                        # Gmail API integration & token management
├── llm-parser.ts                   # Groq API / LLM parsing logic
├── supabase/                       # Supabase client / auth utilities
scripts/
├── test-llm-confidence.ts          # Verify LLM extraction accuracy
└── clean-emails.mjs                # Reset email data for testing
```

## AI Email Scanner

JobSync features an advanced, two-stage AI email parsing system:

1. **Stage 1 (Relevance)**: We fetch email headers from Gmail and use a fast LLM batch check to see if any match your tracked applications.
2. **Stage 2 (Body Parsing)**: For relevant emails, we fetch the full body and use a more capable LLM to extract field updates (status changes, interview invites, salary info, etc.).
3. **Chronological Accuracy**: The system performs a "Bulk Recalculation Phase" after scanning. It looks at all events for an application across its entire history and resets its current state based on the most recent chronological events, ensuring data consistency even when emails arrive out of order.

## API Routes

### User Management
- `GET /api/dev/token`: Get current session token for external testing (Postman, etc.).

### Applications
- `GET /api/applications`: List all applications.
- `POST /api/applications`: Create application (manual or via job URL).
- `GET /api/applications/:id`: Get detailed data for one application.
- `PUT /api/applications/:id`: Update a single application field (auto-logs to timeline).
- `DELETE /api/applications/:id`: Delete an application and all its events.

### AI Scanning
- `POST /api/scan-emails`: Search Gmail for relevant updates in a date range.
- `POST /api/scan-emails/process`: Process selected emails, extracting structured updates.

### Emails
- `PATCH /api/emails`: Toggle `is_active` for an email link (refreshes application state).
- `DELETE /api/emails`: Permanently delete email links and associated timeline events.

## Timezone Support

All date inputs (New Application, Scan Dates, etc.) use a custom local timezone formatter to ensure that "today" matches your browser's system clock, avoiding common UTC "future date" bugs in late-night PDT hours.

## Bulk Actions

The dashboard supports bulk selection for both emails (in the Details panel) and applications (in the List panel), allowing for rapid cleanup and project management.
