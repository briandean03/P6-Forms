# Bolt weekly dashboard integration

The Bolt implementation now powers **Reports → Online Weekly Dashboard** and replaces the previous online renderer. **Weekly Report** and **A3 Dashboard** keep their existing renderers. The canonical URL uses `tab=online_weekly_dashboard`; older `tab=bolt_weekly_dashboard` links open the same replacement dashboard. The comparison below describes the previous online implementation versus the replacement.

The imported frontend lives under `src/boltDashboard`. It is loaded on demand and uses React/TypeScript/Vite already installed by P6 Forms. Its only new package is the pinned `lucide-react` icon library. Its CSS, animation names, and stored selections are isolated from the original dashboard. The P6 sidebar collapses on mobile when this route is selected, leaving room for the report.

## Comparison

| Area | Existing Online Weekly Dashboard | Bolt Weekly Dashboard |
| --- | --- | --- |
| Data after integration | Supabase dashboard structures, designs, and widgets | The same tables, selected project and schema; no duplicate database or separate reporting pipeline |
| Page layout | Existing custom layouts for executive overview, progress/schedule, engineering, construction, resources, commercial, and exceptions | Bolt's cards in a responsive grid driven by structure pages and widget placements, with special layouts for certain widget IDs |
| Charts | Recharts components and the existing reporting helpers | Custom SVG line, donut, bar, and engineering trend charts, with entrance animations |
| Navigation | Existing sticky page menu, continuous report sections, week selector | Bolt's sticky section menu, mobile section pills, continuous sections, and week selector |
| Interactions | Existing report-specific controls and layouts | Chart-range sliders, shared KPI filters, and trade filters; selections are stored separately per project/schema |
| Design | Existing token resolver and typography/print helpers | Bolt token mapping for colors, radii, spacing, shadows, with its own font/rendering conventions |
| Widget interpretation | Existing reporting rules and bespoke page composition | Bolt's widget-specific layouts and support for composite progress, engineering, resource, narrative and exception data |
| Printing | Existing reporting print styles; dedicated A3 Dashboard route provides A3 summary | Multi-section browser print report; this is an additional online view, not a replacement A3 export |
| Unsupported/inconsistent data | Existing rendering/diagnostic behavior | Explicit unsupported-widget notices and warnings for missing, duplicate, or unmapped widgets |

The two views can show different arrangements, decimal precision, KPI subsets, and chart ranges even for the same saved report. Bolt changes presentation; it does not recalculate or write the reporting data. Neither view generates the weekly report by itself; both display database output produced by the existing workflow.

## Changes to the downloaded Bolt project

The ZIP's frontend expected a separate `VITE_DASHBOARD_API_URL` with design, structure, diagnostics, and scoped-widget response envelopes. Its included edge function hardcoded the `atgc` schema and particular design/structure records, returned a different response shape, and did not implement all frontend resources. Copying that API unchanged would not provide correct multi-project week selection.

The integration replaces that API dependency with the existing `schemaClient(schemaName)` and its existing authentication/RLS context. Structures are scoped to the selected project. Widgets are scoped to its selected report ID and placed by widget ID in the selected structure, including when regeneration has left widget rows linked to an older structure. The week selector prefers the newest approved structure for each report. Selecting a different week loads that week's structure, linked design (or approved default), and widgets together; stale asynchronous responses are ignored. No service-role key, uploaded `.env`, Bolt project configuration, or edge function was copied or deployed.

Additional corrections:

- Removed the hardcoded requirement for exactly 49 widgets; validate against the selected structure instead.
- Frontend visibility policy now excludes WGT-011, WGT-012, WGT-036, and WGT-037 across all weeks in online and A3 dashboards, including print. Source database rows are retained; regions containing only hidden widgets are omitted.
- Decode object, JSON-string, and double-encoded JSON columns.
- Normalize missing design dictionaries and retain fallback colors.
- Print the report once instead of printing both the screen sections and a duplicate print-only report.
- Scope styles so visiting this dashboard cannot change the existing dashboard's print styles.

## Run and verify

Use the same `.env.local` / environment settings as P6 Forms (`VITE_SUPABASE_URL` and the public `VITE_SUPABASE_ANON_KEY`), then run `npm ci` and `npm run dev`. No `VITE_DASHBOARD_API_URL` is required.

Select a project and choose **Reports → Online Weekly Dashboard**. Select an older week and confirm the title, date, sections, widgets, and design all correspond to that selection. Verify the selected week against the saved report data. Try a chart range, KPI/trade filter where the corresponding widgets are present, a narrow browser window, and **Print report**.

Existing read access is required to these tables in the selected project schema:

- `dbp6_0008_dashboard_structures`
- `dbp6_0008_dashboard_widgets`
- `dbp6_0008_dashboard_designs`

Missing read grants/RLS access is reported with the schema/table name. Projects without generated structures show an empty state; there is no fabricated demonstration data.

`tests/bolt-dashboard.spec.ts` uses mocked requests for a non-ATGC project schema and tests two different weeks/designs, stringified database columns, custom SVG/KPI rendering, empty results, permission errors and retry, mobile sidebar behavior, print layout, and returning to the original dashboard. It verifies that all dashboard requests are reads and that the project/schema/report filters are present. The ready-state test saves a sample screenshot and PDF in Playwright’s test output directory. Live database data and a full real-world 49-widget report have not been verified here.

Printing uses mixed A4 page orientations: widgets containing a table with six or more columns use landscape; compact tables and chart widgets use portrait. Tables print at full page width, with wrapping cells and repeating headers. Long tables can continue across multiple sheets. Modern Chrome/Edge support the named-page sizes; use browser Save as PDF with the CSS page sizes/default layout and scaling.

## November 2026 Bolt UI refresh

The updated Bolt export is integrated into the existing `src/boltDashboard` renderer. It adds narrative summaries, exception tables, composite progress panels, transmittal submission views, planned-versus-actual resource bars, grouped progress-by-level tables, financial formatting, and additional chart/widget AST shapes. Widgets can reference other widgets from the **same selected reporting week** where the exported layouts require them.

The online view also follows the export's additional exclusions: WGT-006, WGT-034, WGT-035, WGT-045, and WGT-047. The previously excluded WGT-011/012/036/037 remain excluded. This does not delete source rows or change the separate A3 dashboard's visibility rules. Sections containing only excluded widgets are omitted.

The export's standalone API, fixed report ID, environment file, deployment settings, and global styles are not imported. Existing schema/project isolation, week loading, the Construction Intelligence Dashboard title, Appendix storage, expandable hierarchies, persistent KPI selection controls, and mixed-orientation printing remain integrated with P6 Forms. The approval label now reflects the loaded structure's approval flag instead of a local-only selector.

The mocked browser suite also covers the new narrative, exception, resource comparison, and progress-by-level toggle views alongside its existing week, permission, attachment, hierarchy, mobile, and PDF checks. These checks do not validate the contents of a live generated report or deploy any Supabase functions.

Week selection also handles regenerated structures: one selector entry per report, newest approved layout preferred, widgets read by project/report and mapped to the selected layout by widget ID. Regression fixtures include a newer unapproved duplicate structure and widgets split across old/new structure and page IDs.
