# Frontend loading and rendering improvements

The application already has a backend: Supabase supplies PostgreSQL, REST APIs, access policies/auth services, Storage, and Edge Functions. n8n handles the existing background workflow. A separate Express/Node server is not required just to improve this frontend.

## Verified changes

- Form/report routes are loaded through React.lazy/Suspense instead of importing every page into the entry module. The production entry JavaScript decreased from roughly 1,727 kB (416 kB gzip) in the previous build to 352 kB (100 kB gzip) in the build after this change. These are build artifact sizes, not a RAM measurement or a guarantee of a particular load time. Shared chart/Azure dependencies and individual page chunks load when their routes need them.
- The Online Weekly Dashboard memoizes its widget wrapper and keeps the shared KPI-selection callback stable. Changing the scroll-driven highlighted navigation section no longer changes every widget's props. Data, selection, theme, width changes, and widget-local state still update normally.
- Long-lead transmittals are grouped/indexed once when engineering data changes, instead of scanning the engineering history for every dropdown option on every keystroke. The searchable combobox renders at most 100 filtered options; typing narrows the entire option set. Matching is case-insensitive and selection supports keyboard arrows, Enter, and Escape.

These changes do not establish that every site-wide lag or memory issue is solved. Browser tests cover representative routing, chart interactions and print output after the changes; no before/after browser heap profile has been collected.

## Project scope of long-lead records

The app receives the selected project's text ID and schema from the existing project selection. Engineering history is queried by that ID. Long-lead rows are then fetched by those engineering transmittal references. No project ID is automatically stored in the long-lead table, because it has no such column. The engineering foreign key validates reference/revision, not a separate long-lead project ID.

An explicit project relationship is recommended if transmittal references can be reused across projects in one schema, particularly for NULL revisions. It would also let the database filter/paginate the tracker directly without first loading all engineering references. This requires a deliberate schema change/backfill; none was performed by this frontend change. Frontend filtering is not a substitute for database authorization policies.

## Next measurement steps

1. Compare the deployed production build or `npm run build` / `npm run preview`, separately from Bolt's editor, Vite HMR, and extra browser tabs.
2. Use browser Network timings to identify slow/large Supabase requests. Inspect those queries with PostgreSQL EXPLAIN before adding indexes. Some existing pages load entire registers and paginate in the browser; server-side pagination/filtering is a follow-up for those pages.
3. Use Performance/React profiling to identify expensive chart updates and long tasks during scrolling/filtering. Large dashboards may benefit from section virtualization, but print needs a separate full-content path before off-screen sections can be unmounted.
4. Compare heap snapshots after repeatedly switching weeks/projects. Large images/PDF viewers, retained data, and browser/extension memory need separate measurement.

RPCs/views and indexes can optimize database work in Supabase. Use Edge Functions for short privileged operations and n8n/workers for long jobs. Adding an extra backend service alone will not reduce excessive DOM rendering or chart re-renders.
