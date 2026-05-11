# Pipply

Pipply is a job application tracker built with Next.js and Supabase. It lets users track applications manually, import job postings from URLs or pasted text, connect Gmail updates to applications, and view application history through a timeline.

## Tech Stack

- Next.js 16, React 19, TypeScript, and App Router
- Supabase Auth and Postgres
- Groq API for two-stage email and job-posting parsing
- Tailwind CSS 4 and shadcn/ui components
- Framer Motion, React Icons, Lucide, and react-resizable-panels

## Project Structure

- `app/` - Next.js pages, layouts, and API routes
- `components/` - reusable UI components
- `lib/` - Supabase clients, Gmail helpers, parsing logic, validation, and shared utilities
- `types/` - application domain types and generated Next.js route types
- `scripts/` - optional maintenance and test helper scripts
- `supabase/` - SQL setup for the Supabase database
- `public/` - static assets

## Prerequisites

- Node.js 20.9 or newer
- npm
- A Supabase project
- Google OAuth credentials if Gmail scanning will be used
- A Groq API key for job posting import and email parsing

## Environment Setup

Create `.env.local` from `.env.example` and fill in the required values:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Required values:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Optional values:

- `CRON_SECRET` - required only for the scheduled auto-scan endpoint
- `GROQ_API_KEY_2`, `GROQ_API_KEY_3`, etc. - optional extra Groq keys for rate-limit fallback

## Supabase Setup

1. In Supabase, enable the GitHub and Google auth providers.
2. Add this local callback URL to both providers:

```text
http://localhost:3000/auth/callback
```

3. Run `supabase/schema.sql` in the Supabase SQL Editor for a new project.
4. If updating an older project that was created before the compensation selector was added, also run `supabase-compensation-salary-type-migration.sql`.

## Install and Run

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the app at:

```text
http://localhost:3000
```

For a production check:

```bash
npm run build
npm start
```

## Core Features

- Manual application tracking with company, title, compensation, location, date, contact, status, and notes
- Job posting auto-import from URL or pasted posting text
- Gmail scanning with relevance filtering and body parsing
- Application timelines built from field-level events
- Linked email controls for accepting, ignoring, and deleting parsed updates
- Dashboard layout for applications, details, notes, emails, and timeline history

## Useful Scripts

```bash
npm run lint
npm run build
```
