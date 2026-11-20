-- Run once in Supabase SQL Editor. No service-role key is used by the browser.
-- Product requirement: every website visitor may list, view, attach and remove drawings.
-- No UPDATE policy is granted: uploads use unique object names.
-- Re-running this script also adds the DELETE policy to an existing installation.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('weekly-report-appendix', 'weekly-report-appendix', false, 26214400,
  ARRAY['application/pdf','image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'website_read_weekly_appendix') THEN
    CREATE POLICY website_read_weekly_appendix ON storage.objects FOR SELECT TO anon, authenticated
      USING (bucket_id = 'weekly-report-appendix');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'website_attach_weekly_appendix') THEN
    CREATE POLICY website_attach_weekly_appendix ON storage.objects FOR INSERT TO anon, authenticated
      WITH CHECK (bucket_id = 'weekly-report-appendix' AND cardinality(storage.foldername(name)) = 4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'website_remove_weekly_appendix') THEN
    CREATE POLICY website_remove_weekly_appendix ON storage.objects FOR DELETE TO anon, authenticated
      USING (bucket_id = 'weekly-report-appendix' AND cardinality(storage.foldername(name)) = 4);
  END IF;
END $$;
