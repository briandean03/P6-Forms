-- Run this in the Supabase SQL editor (or as a migration).
-- Creates the report job status table for server-side orchestration of webhook 151 + 150.
-- pg_cron polls this table every 30 s, checks widget/structure readiness,
-- calls webhook 150, and updates the status. React subscribes via Realtime.

CREATE TABLE IF NOT EXISTS public.dbp6_0008_report_jobs (
  job_id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid        NOT NULL
                  REFERENCES public.dbp6_0008_widget_generation_requests(request_id)
                  ON DELETE CASCADE,
  schema_name   text        NOT NULL,
  project_id    text        NOT NULL,
  report_id     uuid        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  progress      text,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dbp6_0008_report_jobs ENABLE ROW LEVEL SECURITY;

-- Browser clients may read job rows to display status.
CREATE POLICY "Authenticated read"
  ON public.dbp6_0008_report_jobs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon read"
  ON public.dbp6_0008_report_jobs
  FOR SELECT
  TO anon
  USING (true);

-- No browser writes — only the service-role key (edge functions, pg_cron SECURITY DEFINER) may write.
CREATE POLICY "No direct browser writes"
  ON public.dbp6_0008_report_jobs
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Enable Realtime replication so React can subscribe to row changes.
ALTER PUBLICATION supabase_realtime ADD TABLE public.dbp6_0008_report_jobs;


-- ─────────────────────────────────────────────────────────────────────────────
-- Postgres function called by pg_cron every 30 seconds.
-- Checks widget/structure readiness for all pending/running jobs,
-- calls webhook 150 when ready, marks the job completed, and releases the lock.
--
-- Requires the pg_net extension (enabled by default on Supabase).
-- Uses dynamic SQL (EXECUTE ... USING) to query per-project schemas.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.process_pending_report_jobs()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  job           RECORD;
  expected_ids  text[];
  widget_count  int;
  layout_rid    text;
  widgets_done  bool;
  layout_done   bool;
  progress_text text;
  webhook_150   text := 'https://pmc2p2c.app.n8n.cloud/webhook/912a4eb3-39cf-4f60-8a33-426406bee45c';
BEGIN
  FOR job IN
    SELECT * FROM public.dbp6_0008_report_jobs
    WHERE status IN ('pending', 'running')
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED   -- skip rows already locked by a concurrent cron invocation
  LOOP
    -- Mark as running (idempotent for rows already in 'running')
    UPDATE public.dbp6_0008_report_jobs
    SET status = 'running', updated_at = now()
    WHERE job_id = job.job_id;

    -- ── Expected widget IDs from approved structure_plan ──────────────────────
    -- structure_plan may be stored as a JSONB object or as a JSON-encoded string.
    BEGIN
      EXECUTE format(
        $q$
          SELECT ARRAY(
            SELECT w->>'widget_id'
            FROM   %I.dbp6_0008_dashboard_structures s,
                   jsonb_array_elements(
                     CASE WHEN jsonb_typeof(s.structure_plan) = 'string'
                          THEN (s.structure_plan #>> '{}')::jsonb
                          ELSE s.structure_plan
                     END -> 'pages'
                   ) AS page,
                   jsonb_array_elements(page->'widgets') AS w
            WHERE  s.report_id = $1
              AND  s.is_approved = true
            LIMIT  1000
          )
        $q$,
        job.schema_name
      ) INTO expected_ids USING job.report_id;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.dbp6_0008_report_jobs
      SET progress = 'Error reading structure_plan: ' || SQLERRM, updated_at = now()
      WHERE job_id = job.job_id;
      CONTINUE;
    END;

    IF expected_ids IS NULL OR array_length(expected_ids, 1) IS NULL THEN
      -- Approved structure not yet written — keep polling
      UPDATE public.dbp6_0008_report_jobs
      SET progress = 'Waiting for approved structure with widget plan…', updated_at = now()
      WHERE job_id = job.job_id;
      CONTINUE;
    END IF;

    -- ── Count validated widgets with non-empty widget_ast ─────────────────────
    BEGIN
      EXECUTE format(
        $q$
          SELECT COUNT(*)::int
          FROM   %I.dbp6_0008_dashboard_widgets
          WHERE  report_id = $1
            AND  widget_id = ANY($2)
            AND  processing_status = 'validated'
            AND  widget_ast IS NOT NULL
            AND  widget_ast::text NOT IN ('null', '{}', '""')
        $q$,
        job.schema_name
      ) INTO widget_count USING job.report_id, expected_ids;
    EXCEPTION WHEN OTHERS THEN
      widget_count := 0;
    END;

    -- ── A3 layout: check dashboard_context.report_id ──────────────────────────
    -- a3_layout may be stored as a JSONB object or as a JSON-encoded string.
    BEGIN
      EXECUTE format(
        $q$
          SELECT
            CASE WHEN jsonb_typeof(a3_layout) = 'string'
                 THEN ((a3_layout #>> '{}')::jsonb)->'dashboard_context'->>'report_id'
                 ELSE a3_layout->'dashboard_context'->>'report_id'
            END
          FROM  %I.dbp6_0008_dashboard_structures
          WHERE report_id = $1
            AND is_approved = true
          LIMIT 1
        $q$,
        job.schema_name
      ) INTO layout_rid USING job.report_id;
    EXCEPTION WHEN OTHERS THEN
      layout_rid := NULL;
    END;

    widgets_done := widget_count = array_length(expected_ids, 1);
    layout_done  := layout_rid = job.report_id::text;

    progress_text := format(
      'Widget outputs ready: %s of %s%s',
      widget_count,
      array_length(expected_ids, 1),
      CASE WHEN layout_done THEN '; A3 layout ready.' ELSE '; waiting for A3 layout.' END
    );

    UPDATE public.dbp6_0008_report_jobs
    SET progress = progress_text, updated_at = now()
    WHERE job_id = job.job_id;

    -- ── When both conditions met: call webhook 150 and complete the job ────────
    IF widgets_done AND layout_done THEN
      -- pg_net is available on all Supabase projects.
      -- net.http_post is fire-and-forget (the response is stored in net._http_response).
      -- body is jsonb (not text); Content-Type: application/json is the default.
      PERFORM net.http_post(
        url                  := webhook_150,
        body                 := jsonb_build_object(
                                  'flow_parameters', jsonb_build_object(
                                    'schema',     job.schema_name,
                                    'project_id', job.project_id,
                                    'report_id',  job.report_id::text
                                  )
                                ),
        timeout_milliseconds := 30000
      );

      UPDATE public.dbp6_0008_report_jobs
      SET status = 'completed', updated_at = now()
      WHERE job_id = job.job_id;

      -- Lock row cleanup intentionally omitted: deleting the lock row cascades
      -- (ON DELETE CASCADE) into the job row, preventing React from reading the
      -- 'completed' status via Realtime. The lock row stays; the UNIQUE constraint
      -- on (schema_name, project_id, report_id) still prevents duplicate dispatches.
    END IF;

  END LOOP;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Schedule the cron job.
-- Run this AFTER the function above has been created.
-- Remove an existing schedule first if re-running: SELECT cron.unschedule('poll-widget-151-jobs');
-- ─────────────────────────────────────────────────────────────────────────────

-- SELECT cron.schedule(
--   'poll-widget-151-jobs',
--   '30 seconds',
--   $$SELECT public.process_pending_report_jobs();$$
-- );
