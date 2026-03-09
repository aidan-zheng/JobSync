-- RLS policies for application_current.
-- Run in Supabase SQL Editor.

CREATE POLICY "Allow authenticated insert on application_current"
ON application_current
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated select on application_current"
ON application_current
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated update on application_current"
ON application_current
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated delete on application_current"
ON application_current
FOR DELETE
TO authenticated
USING (true);
