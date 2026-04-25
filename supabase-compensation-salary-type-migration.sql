-- Run this in the Supabase SQL Editor before deploying the compensation selector UI.
-- It adds the new compensation columns, keeps legacy hourly data, and enables
-- timeline events for compensation amount and salary type changes.

ALTER TYPE public.application_field_events_field_name
  ADD VALUE IF NOT EXISTS 'compensation_amount';

ALTER TYPE public.application_field_events_field_name
  ADD VALUE IF NOT EXISTS 'salary_type';

ALTER TABLE public.application_current
  ADD COLUMN IF NOT EXISTS compensation_amount numeric,
  ADD COLUMN IF NOT EXISTS salary_type text;

UPDATE public.application_current
SET
  compensation_amount = COALESCE(compensation_amount, salary_per_hour),
  salary_type = COALESCE(
    salary_type,
    CASE
      WHEN COALESCE(compensation_amount, salary_per_hour) IS NOT NULL THEN 'hourly'
      ELSE NULL
    END
  )
WHERE
  salary_per_hour IS NOT NULL
  AND (compensation_amount IS NULL OR salary_type IS NULL);

ALTER TABLE public.application_current
  DROP CONSTRAINT IF EXISTS application_current_compensation_amount_nonnegative;

ALTER TABLE public.application_current
  ADD CONSTRAINT application_current_compensation_amount_nonnegative
  CHECK (compensation_amount IS NULL OR compensation_amount >= 0);

ALTER TABLE public.application_current
  DROP CONSTRAINT IF EXISTS application_current_salary_type_valid;

ALTER TABLE public.application_current
  ADD CONSTRAINT application_current_salary_type_valid
  CHECK (
    salary_type IS NULL
    OR salary_type IN ('hourly', 'weekly', 'biweekly', 'monthly', 'yearly')
  );

-- Optional sanity check:
-- SELECT id, company_name, compensation_amount, salary_type, salary_per_hour
-- FROM public.application_current
-- ORDER BY updated_at DESC
-- LIMIT 25;
