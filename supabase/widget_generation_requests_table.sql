-- Run this in the Supabase SQL editor (or as a migration).
-- Creates the in-flight lock table for webhook 151 widget generation requests.

CREATE TABLE IF NOT EXISTS public.dbp6_0008_widget_generation_requests (
  request_id   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_name  text        NOT NULL,
  project_id   text        NOT NULL,
  report_id    uuid        NOT NULL,
  status       text        NOT NULL DEFAULT 'dispatched'
                 CHECK (status IN ('dispatched', 'completed', 'failed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- Prevents concurrent dispatches for the same (schema, project, report).
  -- Released only when the front end explicitly calls release-webhook-151-lock.
  CONSTRAINT uq_widget_gen_active
    UNIQUE (schema_name, project_id, report_id)
    DEFERRABLE INITIALLY IMMEDIATE
);

-- Only the service-role key (used by edge functions) may insert, update, or delete.
-- Browser clients may read rows (e.g. to show lock status) but cannot write.
ALTER TABLE public.dbp6_0008_widget_generation_requests ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically in Supabase; this policy guards authenticated/anon roles.
CREATE POLICY "No direct browser writes"
  ON public.dbp6_0008_widget_generation_requests
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Allow authenticated users to read all lock rows (adjust predicate if scoping by user is needed).
CREATE POLICY "Authenticated read"
  ON public.dbp6_0008_widget_generation_requests
  FOR SELECT
  TO authenticated
  USING (true);
