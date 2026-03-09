-- Creates application_field_events table and supporting enums.
-- Run in Supabase SQL Editor.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'application_field_events_source_type') THEN
    CREATE TYPE application_field_events_source_type AS ENUM ('scrape', 'email', 'manual');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'application_field_events_field_name') THEN
    CREATE TYPE application_field_events_field_name AS ENUM (
      'company_name',
      'salary_per_hour',
      'salary_yearly',
      'location_type',
      'location',
      'contact_person',
      'status',
      'date_applied',
      'notes'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.application_field_events (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  application_id bigint NOT NULL,
  source_type application_field_events_source_type,
  email_id bigint,
  field_name application_field_events_field_name NOT NULL,
  value_text text,
  value_number numeric,
  value_date date,
  value_location_type location_type,
  value_status application_status,
  event_time timestamp with time zone NOT NULL,
  confidence numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT application_field_events_pkey PRIMARY KEY (id),
  CONSTRAINT application_field_events_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id)
);

COMMENT ON TABLE public.application_field_events IS 'Timeline events for applications (edits, scrape, email).';
