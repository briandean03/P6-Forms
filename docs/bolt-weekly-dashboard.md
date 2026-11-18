# Bolt weekly dashboard integration

The Reports menu now contains **Bolt Weekly Dashboard** in addition to **Online Weekly Dashboard**, **Weekly Report**, and **A3 Dashboard**. It can also be opened through `tab=bolt_weekly_dashboard` in the existing project URL. The other routes keep their existing renderers.

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
| Widget interpretation | Existing reporting rules and bespoke page composition | Bolt's widget-specific rules, including displaying WGT-013 phase comparison as a table, rounding WGT-034 values, and filtering the main progress KPI panel by known keys |
| Printing | Existing reporting print styles; dedicated A3 Dashboard route provides A3 summary | Multi-section browser print report; this is an additional online view, not a replacement A3 export |
| Unsupported/inconsistent data | Existing rendering/diagnostic behavior | Explicit unsupported-widget notices and warnings for missing, duplicate, or unmapped widgets |

The two views can show different arrangements, decimal precision, KPI subsets, and chart ranges even for the same saved report. Bolt changes presentation; it does not recalculate or write the reporting data. Neither view generates the weekly report by itself; both display database output produced by the existing workflow.

## Changes to the downloaded Bolt project

The ZIP's frontend expected a separate `VITE_DASHBOARD_API_URL` with design, structure, diagnostics, and scoped-widget response envelopes. Its included edge function hardcoded the `atgc` schema and particular design/structure records, returned a different response shape, and did not implement all frontend resources. Copying that API unchanged would not provide correct multi-project week selection.

The integration replaces that API dependency with the existing `schemaClient(schemaName)` and its existing authentication/RLS context. Structures and widgets are scoped to the selected text project ID and structure ID. Selecting a different week loads that week's structure, linked design (or approved default), and widgets together; stale asynchronous responses are ignored. No service-role key, uploaded `.env`, Bolt project configuration, or edge function was copied or deployed.

Additional corrections:

- Removed the hardcoded requirement for exactly 49 widgets; validate against the selected structure instead.
- Render supplied WGT-011, WGT-012, and WGT-036 instead of silently omitting them as the downloaded UI did.
- Decode object, JSON-string, and double-encoded JSON columns.
- Normalize missing design dictionaries and retain fallback colors.
- Print the report once instead of printing both the screen sections and a duplicate print-only report.
- Scope styles so visiting this dashboard cannot change the existing dashboard's print styles.

## Run and verify

Use the same `.env.local` / environment settings as P6 Forms (`VITE_SUPABASE_URL` and the public `VITE_SUPABASE_ANON_KEY`), then run `npm ci` and `npm run dev`. No `VITE_DASHBOARD_API_URL` is required.

Select a project and choose **Reports → Bolt Weekly Dashboard**. Select an older week and confirm the title, date, sections, widgets, and design all correspond to that selection. Compare the same week in **Online Weekly Dashboard**. Try a chart range, KPI/trade filter where the corresponding widgets are present, a narrow browser window, and **Print report**.

Existing read access is required to these tables in the selected project schema:

- `dbp6_0008_dashboard_structures`
- `dbp6_0008_dashboard_widgets`
- `dbp6_0008_dashboard_designs`

Missing read grants/RLS access is reported with the schema/table name. Projects without generated structures show an empty state; there is no fabricated demonstration data.

`tests/bolt-dashboard.spec.ts` uses mocked requests for a non-ATGC project schema and tests two different weeks/designs, stringified database columns, custom SVG/KPI rendering, empty results, permission errors and retry, mobile sidebar behavior, print layout, and returning to the original dashboard. It verifies that all dashboard requests are reads and that the project/schema filters are present. The ready-state test saves a sample screenshot and PDF in Playwright’s test output directory. Live database data and a full real-world 49-widget report have not been verified here.
