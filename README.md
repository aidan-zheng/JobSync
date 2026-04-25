# Pipply

A job application tracker built with Next.js and Supabase. It tracks applications, stores field changes over time, supports job URL auto-import, and syncs Gmail updates through AI parsing.

## Tech Stack

- **Next.js 16** with App Router, React 19, and TypeScript
- **Supabase** for auth and Postgres
- **Groq API** for two-stage AI email parsing
- **Tailwind CSS 4** and **shadcn/ui**
- **Framer Motion**
- **react-resizable-panels**

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables in `.env`:

```text
NEXT_PUBLIC_SUPABASE_URL=<your supabase project url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
SUPABASE_SERVICE_ROLE_KEY=<your service role key>
GROQ_API_KEY=<your groq api key>
GOOGLE_CLIENT_ID=<your google oauth client id>
GOOGLE_CLIENT_SECRET=<your google oauth client secret>
```

3. Run the database setup and migrations in Supabase:

- `supabase-user-tokens.sql`
- `supabase-compensation-salary-type-migration.sql`

The main data tables are:

- `applications`
- `application_current`
- `application_field_events`
- `emails`
- `application_email_links`
- `user_tokens`

4. Enable GitHub and Google auth providers in Supabase and set the callback URL to `http://localhost:3000/auth/callback`.

5. Start the app:

```bash
npm run dev
```

## Core Features

- Manual application tracking with `compensation_amount` plus `salary_type`
- Job posting auto-import from URL
- Timeline-backed field event history
- Gmail scanning with relevance filtering and body parsing
- Three-panel dashboard with linked-email controls and bulk actions

## API Overview

- `GET /api/applications`
- `POST /api/applications`
- `POST /api/applications/auto-import`
- `GET /api/applications/:id`
- `PUT /api/applications/:id`
- `DELETE /api/applications/:id`
- `GET /api/applications/:id/events`
- `GET /api/emails`
- `PATCH /api/emails`
- `DELETE /api/emails`
- `GET /api/emails/:id`
- `POST /api/scan-emails`
- `POST /api/scan-emails/process`
- `GET /api/timeline`
