# Report generation: phase 1

This is administrator-only monitoring, not automatic orchestration. It creates
no webhook calls, HTTP jobs, cron jobs, browser RPCs, or client grants. The app
and existing n8n workflows continue operating as before. Apply this first in a
test Supabase project if available.

## Why this stage exists

HTTP 200/202 acknowledges a request; 524 does not mean n8n stopped. Existing rows
and a shared `updated_at` do not establish that a particular generation finished.
We need to observe actual database writes before choosing readiness rules.

The supplied structure lists 49 widgets; the supplied approved design maps 14
sections and four appendices. Those numbers are examples, never constants. Some
appendices may be conditional, and unavailable-data placeholders can be valid
outputs. `generated_with_qualifications` is not automatically a failure.

## 1. Install once

Open `supabase/manual/001_report_generation_monitor.sql`, copy the whole file into
Supabase SQL Editor, and run it as the database administrator. It creates a
private `report_monitor` schema. This initial migration intentionally fails if
already installed: do not blindly rerun it or delete existing observations.

Then install the triggers for one project schema:

```sql
select report_monitor.install('atgc');
```

This adds AFTER triggers; it does not change source rows, their existing
triggers, permissions, or RLS. Installation is transactional if a table/column is
missing. Each schema needs its own explicit installation. The schema must have
the four generator output tables and the report design table with `report_id`.

The observer stores IDs/status metadata only. It does not copy financial
packages, photographs, or report narrative. Trigger failures emit a database
warning rather than aborting generator writes; missing evidence is unconfirmed.

## 2. Begin observing an existing report

For the provided example:

```sql
select report_monitor.begin_run(
  'atgc',
  'PRJ-ATGC-01',
  '3890b37e-3f16-418b-827e-1bdb93171844'::uuid
) as request_id;
```

Save the returned UUID. This phase deliberately monitors an existing report;
first-ever report creation will be handled in the future coordinator.

The function chooses an **approved and active** design from that schema, preferring
a matching report, then project-specific, then schema-wide design. Ties use the
latest update and ID. It pins the full design and section/appendix mappings to
this observation. No applicable approved design means it stops with an error.
Approval does not mean the mapped appendices are all mandatory.

Only one observation can run for a schema/project at a time. Observations expire
after 30 minutes. Do not start competing manual/scheduled generations for the
same report: existing n8n writes have no request ID, so they cannot be reliably
attributed to one of several overlapping executions.

## 3. Observe each stage separately

The initial watched stage is 149. Before manually invoking the next workflow,
select that stage using the returned request ID:

```sql
select report_monitor.watch_stage('YOUR_REQUEST_ID'::uuid, '152');
-- Later, before running 151:
select report_monitor.watch_stage('YOUR_REQUEST_ID'::uuid, '151');
-- Later, before running 150:
select report_monitor.watch_stage('YOUR_REQUEST_ID'::uuid, '150');
```

Run these at different times, not together. The functions do not trigger n8n.
Do not run the app's existing full sequence for this test: its automatic steps
could advance before you switch the watched stage. Invoke individual workflows
through your existing n8n/manual process. A generation that continues after 524
can still produce observations.

When re-testing the same stage, end the observation and begin another so old
events are not mixed into the new test.

## 4. Inspect evidence

```sql
select request_id, project_schema, project_id, report_id, design_id,
       expected_sections, expected_appendices, stage, status, expires_at
from report_monitor.runs
where request_id = 'YOUR_REQUEST_ID'::uuid;

select stage, source_table, output_id, operation, observed_at, detail
from report_monitor.events
where request_id = 'YOUR_REQUEST_ID'::uuid
order by event_id;

select stage, source_table, detail->>'column_assigned' as column_assigned,
       count(*) as write_events, count(distinct output_id) as distinct_outputs
from report_monitor.events
where request_id = 'YOUR_REQUEST_ID'::uuid
group by stage, source_table, detail->>'column_assigned'
order by stage, source_table, column_assigned;
```

Interpret the observations conservatively:

| Stage | Recorded evidence | What it does NOT establish |
| --- | --- | --- |
| 149 | A write targeting the core calculation-package columns | All calculations are complete |
| 152 | Assignments to each of the four independent-package columns, including unchanged values | A populated package is fresh, or all writes came from 152 |
| 151 | Widget identities/statuses and `a3_layout` assignments, including unchanged layouts | All expected outputs are ready, or the entire execution has ended |
| 150 | Section identities, processing/generation statuses, AST presence | Every mapped section/conditional appendix was generated |

PostgreSQL `UPDATE OF` fires when a column is in the statement's target list,
even if its value does not change. If n8n updates all columns in one statement,
that is not proof it separately fetched every source. Likewise, repeated updates
of one widget must never be counted as several completed widgets. Nested JSON
strings are decoded for status inspection.

## 5. End observation

```sql
select report_monitor.end_run('YOUR_REQUEST_ID'::uuid);
```

Send the summary plus event rows (IDs, timestamps, statuses only) from each
separate stage back for review. This is the evidence needed to decide whether
output-based progression is safe and which sections/appendices are required.
Do not send credentials, photo URLs, or calculation package contents.

## What follows after validation

1. Add a durable request queue and a scheduled worker with bounded attempts.
2. Keep dispatch credentials server-side; allow only the four fixed webhook URLs.
3. Record outbound dispatch IDs separately from observed output events.
4. Stop on uncertain dispatches instead of blindly retrying potentially running
   executions. Serialize generation per schema/project/report.
5. Add a guarded browser API with abuse controls and metadata-only status access.
   The demo has no login, so unrestricted anonymous dispatch is not appropriate.
6. React submits once and polls status; readiness rules gate the next stage.

`pg_net` and `pg_cron` will be used only when the worker is built. They are not
needed or enabled by this monitoring script. No existing RLS is disabled and no
full calculation packages are exposed to the browser.

## Removal

To remove only this monitoring infrastructure, run as administrator:

```sql
drop schema report_monitor cascade;
```

This deletes observation records and its functions/triggers, including the
observer triggers on source tables. It does not drop the generator output tables.
