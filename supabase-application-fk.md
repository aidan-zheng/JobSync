# application_current.application_id foreign key

`application_current.application_id` references `public.applications(id)`.

## Schema (for context)

- **applications**: `id` (identity), `user_id` (uuid, default auth.uid()), `job_url`, `created_at`, `updated_at`
- **application_current**: `id`, `application_id` (FK → applications.id), `updated_at`, plus job fields: `company_name`, `job_title`, `salary_per_hour`, `notes`, `location_type`, `location`, `date_applied`, `contact_person`, `status`

## What the API does

1. Insert into **applications** with `user_id` (from session) and optional `job_url` (for automatic mode).
2. Insert into **application_current** with `application_id` = the new `applications.id` and all job detail columns.
