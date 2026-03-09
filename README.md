# JobSync

A job application tracker built with Next.js and Supabase. Track applications, log field changes over time, and keep everything in one place.

## Tech Stack

- **Next.js 16** (App Router) — React 19, TypeScript
- **Supabase** — Auth (GitHub + Google OAuth), Postgres database
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
   ```

3. **Set up the database**

   Run these SQL files in the Supabase SQL Editor (in order):

   - `supabase-rls-application-current.sql` — RLS policies for `application_current`
   - `supabase-application-field-events.sql` — creates the `application_field_events` table and enums

   The database schema is two main tables:
   - **`applications`** — one row per application, holds `user_id`, optional `job_url`, timestamps
   - **`application_current`** — one row per application, holds all the editable job fields (company, title, salary, status, etc.), linked via `application_id` FK

   There's also `application_field_events` for tracking every field change over time (timeline).

4. **Configure OAuth providers**

   In your Supabase dashboard, enable GitHub and/or Google as auth providers. Set the redirect URL to `http://localhost:3000/auth/callback`.

5. **Run the dev server**

   ```bash
   npm run dev
   ```

## Project Structure

```
app/
├── page.tsx                        # Redirects to /dashboard
├── layout.tsx                      # Root layout (fonts, global CSS)
├── globals.css                     # Tailwind + shadcn theme + custom vars
├── login/
│   ├── page.tsx                    # OAuth login (GitHub / Google)
│   └── login.module.css
├── dashboard/
│   ├── page.tsx                    # Main dashboard page
│   ├── dashboard.module.css
│   └── components/
│       ├── ApplicationsList.tsx    # Left panel — searchable/filterable list
│       ├── ApplicationDetails.tsx  # Center panel — inline-editable fields
│       ├── EmailsTimeline.tsx      # Right panel — timeline of field changes
│       └── NewApplicationModal.tsx # Modal for creating applications
├── auth/
│   └── callback/route.ts          # OAuth callback handler
├── api/
│   ├── applications/
│   │   ├── route.ts               # GET (list) / POST (create)
│   │   └── [id]/
│   │       ├── route.ts           # GET / PUT (single-field update) / DELETE
│   │       └── events/route.ts    # GET field change events (timeline)
│   ├── emails/route.ts            # Stub — not yet implemented
│   ├── timeline/route.ts          # Stub — not yet implemented
│   └── dev/token/route.ts         # Dev-only: grab session token for Postman
├── test/page.tsx                   # Empty test page
```

```
components/
├── Grainient/                      # WebGL animated gradient background
│   ├── Grainient.jsx
│   └── Grainient.css
└── ui/                             # shadcn/ui components (button, dialog, input, etc.)

lib/
├── utils.ts                        # cn() helper (clsx + tailwind-merge)
└── supabase/
    ├── client.ts                   # Browser Supabase client
    ├── server.ts                   # Server-side Supabase client (cookies)
    ├── middleware.ts               # Session refresh + auth redirect logic
    ├── admin.ts                    # Service-role client (bypasses RLS)
    └── api-auth.ts                 # getApiUser() — supports cookie + Bearer token auth

types/
└── applications.ts                 # TypeScript types, status/location enums, label maps
```

## Pages

| Route | What it does |
|---|---|
| `/` | Redirects to `/dashboard` |
| `/login` | OAuth login page (GitHub, Google) |
| `/dashboard` | Three-panel application tracker |
| `/auth/callback` | Handles the OAuth redirect from Supabase |

## API Routes

All API routes require authentication (cookie session or `Authorization: Bearer <token>` header).

### `GET /api/applications`

Returns all applications for the logged-in user (from `application_current`, ordered by `date_applied` descending).

### `POST /api/applications`

Creates a new application. Body:

```json
{ "mode": "manual", "company_name": "Acme", "job_title": "Engineer", ... }
```

or

```json
{ "mode": "automatic", "job_url": "https://..." }
```

Automatic mode currently creates a placeholder and stores the URL — scraping is not yet wired up.

### `GET /api/applications/:id`

Returns a single `application_current` row. Checks ownership via the parent `applications` table.

### `PUT /api/applications/:id`

Updates a single field and logs it as a timeline event. Body:

```json
{ "field_name": "status", "value": "interviewing" }
```

Supported fields: `salary_per_hour`, `salary_yearly`, `location_type`, `location`, `contact_person`, `status`, `date_applied`, `notes`.

### `DELETE /api/applications/:id`

Deletes the `application_current` row and the parent `applications` row.

### `GET /api/applications/:id/events`

Returns `application_field_events` for a given application (timeline data).

### `GET /api/dev/token`

Dev-only. Returns the current session's access token so you can test API routes in Postman.

### `GET /api/emails` / `POST /api/emails`

Not yet implemented (returns 501).

### `GET /api/timeline` / `POST /api/timeline`

Not yet implemented (returns 501).

## Authentication Flow

1. User clicks "Log in with GitHub/Google" on `/login`
2. Supabase redirects to the provider, then back to `/auth/callback`
3. The callback exchanges the code for a session and redirects to `/`
4. Middleware (`middleware.ts`) runs on every request — refreshes the session cookie and redirects unauthenticated users to `/login`
5. API routes authenticate via `getApiUser()`, which checks for a Bearer token first, then falls back to cookie-based session

## Database Schema

See `supabase-application-fk.md` for the full relationship breakdown. The short version:

- **`applications`** — `id`, `user_id`, `job_url`, `created_at`, `updated_at`
- **`application_current`** — `id`, `application_id` (FK to applications), all job detail fields
- **`application_field_events`** — `id`, `application_id` (FK), `source_type`, `field_name`, typed value columns, `event_time`
- **`application_emails`** — linked emails (queried directly via Supabase client on the dashboard)
