# Request ID entry point: phase 1

This is an alternative to installing the observation triggers first. It does not
depend on migration 001. It dispatches **149 only**; it is not yet the complete
149/152/151/150 coordinator and never marks a report ready.

## What happens

1. React creates and saves a request ID and a separate random status-access token.
2. `dbp6_weekly_report_request` validates the schema/project and saves the request.
3. It queues a fixed webhook 149 call through `pg_net` in the same transaction.
4. The RPC returns the request ID; `pg_net` sends the POST after commit.
5. React polls the status RPC. HTTP 200/202 means **accepted**; a timeout means
   **dispatch uncertain**. Neither means the calculations/report are ready.

The saved request can be checked after refreshing the same browser tab. Retrying
submission with the same request ID and token returns that request without
dispatching another HTTP call. Closing the browser does not cancel the queued
database HTTP request. This does not yet provide durable sequencing of later
stages or automatic retries.

## Setup in Supabase

Run the entire `supabase/manual/002_report_request_entry.sql` file once in SQL
Editor as administrator. This creates `pg_net`, a private request schema, and two
public RPCs. It does not modify n8n, report data, or existing report RLS. No cron
job or monitoring triggers are installed.

Review the existing project mappings:

```sql
select schema_name, dgt_projectid
from public.p6_project_mapping
where schema_name is not null and schema_name <> 'public'
order by schema_name, dgt_projectid;
```

Explicitly enable a project from that list, for example:

```sql
insert into report_requests_private.allowed_projects(project_schema,project_id,enabled)
values ('atgc','PRJ-ATGC-01',true)
on conflict(project_schema,project_id) do update set enabled=true;
```

This is configuration, not a hardcoded application/schema ID. Repeat for the
projects you want to test. A request is permitted only when its schema/project
pair is both enabled here and present in `public.p6_project_mapping`.

## Enable the frontend demo

Set this variable in your local `.env.local`, or in the Vercel environment settings:

```text
VITE_SUPABASE_REPORT_REQUESTS=true
```

Restart Vite locally, or rebuild/redeploy on Vercel. Vite environment variables
are build-time settings. This changes only the report-sequence panel in Project
Data → Sync to the new request demo. It leaves other existing webhook controls
unchanged. With the flag absent, the existing direct sequence remains in place.

## Test one request

1. Select an enabled project and open Project Data → Sync.
2. Click **Request calculations**. This triggers live webhook 149.
3. A request ID appears. The status changes from queued to accepted, rejected, or
   dispatch uncertain. An accepted result must not say "report ready".
4. Refresh and reopen Sync. **Check status** recovers the saved ticket. Do not
   copy/share the separate access token from browser storage or request bodies.
5. Check workflow 149's execution and calculation outputs before closing this
   observation. No requests to 152/151/150 are sent by this demo.

The server refuses another open request for the same schema/project, even from a
different tab. There is also a minimum one-minute interval between new requests.
If the browser loses the submission response, **Submit or recover same request**
uses the same ID/token instead of creating a duplicate.

If dispatch is uncertain, the execution may still be running. Do not assume it
failed, and do not automatically retry.

## Administrator inspection and closure

Inspect only the operational fields (not the private access token):

```sql
select request_id, project_schema, project_id, status, http_status, created_at
from report_requests_private.requests
order by created_at desc;
```

After checking n8n and confirming it is safe to allow another request:

```sql
update report_requests_private.requests
set status='closed', updated_at=clock_timestamp()
where request_id='YOUR_REQUEST_ID'::uuid;
```

In React, check status again, then clear the closed ticket. "Closed" is an
administrative release, not a claim that the report was generated successfully.

## Access and limits

There is no service-role key in React. Tables have RLS with no client policies;
the browser sees only metadata returned by the two narrow RPCs. The status token
is a bearer capability, not a login system. This demo allows anonymous dispatch
for explicitly enabled projects. Anyone who can reach the public app can submit
for those projects and can occupy their single open slot. The allowlist and
throttle reduce accidental/duplicate calls; they do not replace authentication,
authorization, CAPTCHA, or comprehensive abuse controls. Keep the feature limited
to controlled demonstrations until those are added.

`pg_net` has an asynchronous worker and retains HTTP responses for a limited
time. Poll promptly; missing/expired responses become uncertain, not successful.
Its ten-second dispatch timeout cannot stop an n8n execution that already began.

## Next stage

Add server-side output readiness checks and durable scheduling for the remaining
steps. Only then can the request progress from accepted to report-ready. The
monitoring script remains available if write evidence is needed to establish
those checks.

## Remove this demo

Disable the frontend flag and rebuild. Before removing server resources, inspect
any queued/in-flight `pg_net` requests: dropping the tables does not cancel them.

```sql
drop function public.dbp6_weekly_report_request(text,text,uuid,uuid);
drop function public.dbp6_weekly_report_request_status(uuid,uuid);
drop schema report_requests_private cascade;
```

Do not drop `pg_net` if other application features use it.
