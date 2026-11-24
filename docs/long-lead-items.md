# Long Lead Items input page

Open a project and choose **Documents → Long Lead Items** (`tab=longlead`). This uses the existing Supabase client/auth context and dynamic selected schema; no ATGC schema or credentials are hardcoded.

The page reads `dbp6_000401_longlead` and the selected project's `dbp6_000401_engineering_history` references. It supports adding, editing, confirmed deletion, text search, week filtering, and 15-row pagination. It loads database results in batches so the Supabase default response limit does not silently truncate the engineering options or tracker.

A new item defaults to the project's current week from `dbp6_0000_projectdata`. Selecting a transmittal defaults to its highest available numbered revision. Engineers may select an older revision or NULL explicitly. Revision 0, NULL, LPO 0, and empty values are kept distinct. LPO must be a non-negative PostgreSQL integer; week must be a positive integer or empty. Date fields remain editable independently; no dates are invented or recalculated. Procurement status accepts existing/custom text and offers common suggestions.

The transmittal selector supports case-insensitive typing, keyboard selection, and a maximum of 100 rendered matches at a time. It includes the project's engineering references, with existing long-lead flags identified in the label. Creating a tracker entry does not silently modify engineering history or its is_long_lead flag. Multiple tracker rows for the same transmittal are supported, matching the current table schema.

The table has no project ID column. Records are therefore scoped through engineering references belonging to the selected project's text ID. References absent from that project's engineering history will not appear. Transmittal references should identify a project within a schema; a project ID on the tracker would be needed to distinguish a reused reference with NULL revision across multiple projects.

## Database setup and validation

The user-provided table definition is used as-is, including `delivered_date`, `week_num`, integer `lpo_number`, and nullable `engineering_revision`. No database migration or data update is performed by this feature. Other schemas need equivalent tables to use this page. The current ATGC long-lead and engineering history tables were confirmed readable with the configured client.

The frontend needs SELECT on engineering history/project data, and SELECT/INSERT/UPDATE/DELETE access on the tracker through the website's existing roles and RLS rules. Errors show the exact schema/table and database message; a zero-row mutation is treated as a failure, rather than displaying false success. Table access is enforced by database policy; frontend project filtering is not an authorization substitute.

## Test

Use a test project, or remove any test records afterwards:

1. Open an existing imported item and verify its dates, revision, week, supplier, status, and LPO.
2. Add an item: choose a transmittal, check the latest revision and current-week defaults, enter procurement details, and save.
3. Test revision 0 and NULL separately. Empty dates/LPO/week save as NULL; an entered LPO 0 saves as zero.
4. Edit delivery/status while preserving the imported planned dates. Reload to verify.
5. Search by transmittal, supplier, status, or LPO; filter by week or unspecified week.
6. Cancel an unsaved edit and confirm discard; cancel deletion to preserve a record, then confirm deletion for a test record.

Browser tests use mocked writes, validate dynamic schema/project queries and permission errors, and cover create/edit/delete, revision and integer handling, week filtering, and discard confirmation. Live database writes were not exercised.
