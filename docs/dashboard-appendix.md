# Online dashboard Appendix

Appendix is a frontend-defined final section in every available weekly dashboard. It does not depend on an n8n section or widget. The dashboard's week selector controls its scope, and the desktop section menu and mobile pills include Appendix last.

## One-time Supabase setup

Run `supabase/dashboard_appendix_storage.sql` in the SQL Editor of the same Supabase project that P6 Forms already uses. This creates the `weekly-report-appendix` bucket and its object policies. The application continues using the existing public/anon client key, with no additional environment variables or service-role key.

As requested, all website visitors can list, view, attach, and remove files without signing in. This is enforced by SELECT/INSERT/DELETE policies for both the `anon` and `authenticated` database roles, scoped to this bucket only. No UPDATE policy is added. Removal is permanent and available to all website visitors, with an explicit confirmation dialog. The bucket enforces a 25 MB limit and PDF/PNG/JPEG/WebP MIME types. Its `public` flag is false; previews use one-hour signed URLs, which refresh while the appendix is open. The anonymous SELECT policy means drawings are intentionally shared with everyone who can access the site, not confidential user-only files.

The SQL is additive and does not change other buckets. If a bucket with this name already exists, verify its MIME types and size limit; the script preserves existing bucket settings. The SQL has not been applied to the live Supabase project by this change.

## Storage and behavior

Object names use `schema/project/week-N/data-date/uuid--encoded-original-filename`. Week and date form the stable reporting scope: regenerating a dashboard structure or report ID for that same week/date does not lose its attachments. Different projects, schemas, weeks, or data dates have separate lists. The storage folder is an organizational scope; access is shared across website visitors per the policy above.

Files are stored directly in Storage, so no new application metadata table is required. A UUID prevents duplicate filenames from replacing existing files. Engineers can select and attach multiple files at once, select any existing attachment, and preview supported images or PDFs inline. A new-tab link is available for large drawings and browsers without embedded PDF support. Export DWG/DXF/CAD files to PDF before uploading. PDF viewers support their normal zoom and page navigation. Attached PDFs are not merged into the dashboard's print output; open and print those drawings separately.

## Verify

1. Apply the SQL, open a project/week, scroll to Appendix, and choose **Attach drawings**.
2. Upload an image and confirm its preview appears. Reload and confirm the file remains available.
3. Use **Remove attachment**, cancel once to keep the drawing, then confirm removal. Reload to verify it remains removed. Re-run the setup SQL if the bucket already exists to add its DELETE policy.
4. Upload a PDF and select it; confirm the PDF viewer and new-tab link work.
5. Switch weeks and confirm the attachment lists are separate. Switch back to see the originals.
6. Repeat for a different project/schema. Regenerate the same report/week/date and confirm its drawings remain.

The frontend build and mocked browser tests cover the permanent final section, image upload and preview, reload persistence, cancellation and permission failure on removal, successful deletion, and isolation when changing weeks. Live Storage operations require the one-time SQL setup and a live verification. Bucket/policy errors are shown in Appendix, rather than working around permissions.

Batch uploads run sequentially with completed-file progress. Each file is validated independently against the type and 25 MB limit. A failed upload does not stop the remaining files; the final summary lists failed filenames and errors. Successful files remain attached and failed files can be selected again to retry. No additional SQL changes are needed for multi-file uploads.
