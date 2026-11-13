# Functional staging workspace

A separate frontend deployment using the SAME Supabase project, schemas, public
anon key, Edge Function and n8n workflows. No database changes are included.

## Separate Vercel deployment

1. Push `staging/webhook-workspace` to the existing GitHub repository.
2. Create a second Vercel project importing this repository. Use this branch as
   its Production Branch, or merge into a maintained staging branch first.
   Leave the existing production Vercel project unchanged.
3. Set build command `npm run build`, output directory `dist`.
4. Set `VITE_APP_MODE=staging`, the existing `VITE_SUPABASE_URL` and public
   `VITE_SUPABASE_ANON_KEY`. See `.env.staging.example`. Never put a service-role
   key in VITE variables: browser configuration is public.
5. Deploy. Flags are compiled at build time; redeploy when changing them.
   The production project should omit VITE_APP_MODE or use `production`.

Optional direct webhook overrides are in the environment example. Direct URLs
can also be edited for one page session. They do not alter production settings
or the database processor's 150 endpoint. The 151 proxy address is fixed to the
configured Supabase project so authorization is never sent to an editable URL.

No tests, builds, type checks, live webhook calls, database writes or deployments
were performed during implementation, as requested. This branch includes main through
commit b2425bf. Review newer main changes before merging if main advances again.
Unrelated edits in the original checkout were left untouched.

## Features

- Select a project/schema from existing public project/mapping records.
- Select an existing report/week from the calculation catalogue. Current project
  week is read separately from the selected schema's project data.
- Online Weekly Dashboard, Weekly Report and Weekly Dashboard (A3/print) use the
  existing renderers, pinned to the selected report. Reload does not run webhooks.
- Call one webhook or the existing full sequence, after reviewing its destination
  and exact payload. Individual calls intentionally bypass sequence prerequisites.
- The full sequence reuses runReportSync: 149 and calculation polling, then 149B,
  152 and the 151 Edge Function. The server controls 150 after this handoff; the
  browser does not dispatch 150 a second time.
- 149's payload contains schema/project_id only. It targets the project's current
  week. Historical-week calls to 149/full sequence are disabled. Change the current
  project week using the existing project-data process, not this workspace.
- Output inspector reads calculation metadata, design identity/section mappings,
  structure plans/layout context, widget and section metadata, public jobs and
  request locks. Public records are filtered by schema/project/report. Full ASTs
  and packages are fetched only when Inspect is clicked.
- Query errors are shown explicitly. Empty SELECT results do not prove rows do
  not exist when RLS might hide them. This frontend cannot bypass RLS.
- Use Reload weeks to discover newly created calculation reports after an
  individually accepted 149 call. Refresh outputs reloads the selected report.
- Read-only refresh and five-second monitoring never call webhooks. Stopping
  monitoring or closing the page does not cancel n8n.
- Capture a baseline, compare output metadata, and export snapshots or full rows.
  Comparisons do not inspect AST content or attribute writes to a particular run.
- Browser-local history retains up to 20 calls/sequences with payloads, HTTP
  responses (first 8,000 characters), timing, output snapshots and errors. Keys and
  authorization headers are not logged. Exports can contain project data.
- Storage failures are shown. Clearing browser history changes no database rows.
  Reloaded unfinished runs show an unknown outcome and are never retried.

## Diagnostic limits

Widget checks use the report's latest approved structure, validated status and
updated_at newer than the latest job. These are observations, not proof n8n
finished. A3 report identity is checked; fresh layout writes and AST usability
are not certified. The workspace does not announce report completion from HTTP
200/202 or an existing job's completed flag, which can mean 150 was only queued.
149B and 152 still advance on HTTP acceptance, matching the existing sequence.
No backend workflow completion protocol has been added.

151 can automatically dispatch 150 through your existing processor. Check for
another execution before manual calls. Network/CORS errors may have uncertain
outcomes and are never automatically retried.

This is frontend separation, NOT data isolation or an authentication boundary.
These controls write real data through your existing webhooks. In-page locking
prevents concurrent clicks here but cannot stop a production/other-tab/device run.
There are no reset/delete tools. Restrict the staging deployment through Vercel
if needed; the staging environment flag is not access control.
