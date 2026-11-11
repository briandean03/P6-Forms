-- DISPOSABLE PostgreSQL database only. psql -v ON_ERROR_STOP=1 -f this-file
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create schema atgc;
create table atgc.dbp6_0008_weekly_reports_calculations (
  report_id uuid primary key, project_id text, week_num integer,
  baseline_progress_package jsonb, actual_progress_package jsonb,
  planned_kpi_calculations_package jsonb, actual_kpi_calculations_package jsonb,
  engineering_status_package jsonb, qaqc_hse_package jsonb,
  actual_resources_package jsonb, schedule_analysis_package jsonb,
  payment_status_package jsonb, variation_status_package jsonb,
  progress_photos_package jsonb, safety_statistics_package jsonb
);
create table atgc.dbp6_0008_dashboard_widgets (
  project_id text, report_id uuid, structure_id uuid, widget_id text,
  processing_status text, data_status text, widget_ast jsonb
);
create table atgc.dbp6_0008_dashboard_structures (
  project_id text, report_id uuid, structure_id uuid, a3_layout jsonb
);
create table atgc.dbp6_0008_weekly_report_sections (
  project_id text, report_id uuid, section_id text, processing_status text,
  section_ast jsonb, generation_metadata jsonb
);
create table atgc.dbp6_0008_weekly_report_design (
  id bigint, design_id uuid, project_id text, report_id uuid,
  report_type text, is_approved boolean, is_active boolean, sections jsonb,
  updated_at timestamptz
);
create schema second_project;
create table second_project.dbp6_0008_weekly_reports_calculations (like atgc.dbp6_0008_weekly_reports_calculations including all);
create table second_project.dbp6_0008_dashboard_widgets (like atgc.dbp6_0008_dashboard_widgets including all);
create table second_project.dbp6_0008_dashboard_structures (like atgc.dbp6_0008_dashboard_structures including all);
create table second_project.dbp6_0008_weekly_report_sections (like atgc.dbp6_0008_weekly_report_sections including all);
create table second_project.dbp6_0008_weekly_report_design (like atgc.dbp6_0008_weekly_report_design including all);

\ir ../supabase/manual/001_report_generation_monitor.sql

select report_monitor.install('atgc');
select report_monitor.install('second_project');

insert into atgc.dbp6_0008_weekly_reports_calculations(report_id,project_id,week_num,payment_status_package)
values ('00000000-0000-0000-0000-000000000001','P1',54,'[]');
insert into second_project.dbp6_0008_weekly_reports_calculations select * from atgc.dbp6_0008_weekly_reports_calculations;
insert into atgc.dbp6_0008_weekly_report_design values
  (1,'00000000-0000-0000-0000-000000000002','P1',null,'Weekly Progress Report',true,true,
   '{"section_design_mapping":[{"section_id":"SEC-001"},{"section_id":"SEC-002"}],"appendix_design_mapping":[{"appendix_id":"APP-A"}]}',now()),
  (2,'00000000-0000-0000-0000-000000000003','P1',null,'Weekly Progress Report',false,true,'{}',now()+interval '1 day');
insert into second_project.dbp6_0008_weekly_report_design select * from atgc.dbp6_0008_weekly_report_design;

do $$
declare request uuid; other uuid; seen integer;
begin
  request := report_monitor.begin_run('atgc','P1','00000000-0000-0000-0000-000000000001');
  other := report_monitor.begin_run('second_project','P1','00000000-0000-0000-0000-000000000001');
  if (select design_id from report_monitor.runs where request_id=request) <> '00000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'Unapproved design selected';
  end if;
  if (select cardinality(expected_sections) from report_monitor.runs where request_id=request) <> 2 then
    raise exception 'Dynamic section mapping failed';
  end if;
  begin
    perform report_monitor.begin_run('atgc','P1','00000000-0000-0000-0000-000000000001');
    raise exception 'Duplicate project monitor was allowed';
  exception when unique_violation then null;
  end;
  update atgc.dbp6_0008_weekly_reports_calculations set baseline_progress_package='{}';
  if (select count(*) from report_monitor.events where request_id=request) <> 1 then raise exception '149 observation missing'; end if;
  if exists(select 1 from report_monitor.events where request_id=other) then raise exception 'Schema isolation failed'; end if;
  perform report_monitor.watch_stage(request,'152');
  update atgc.dbp6_0008_weekly_reports_calculations set payment_status_package=payment_status_package,
    variation_status_package='{}', progress_photos_package='[]', safety_statistics_package='{}';
  if (select count(distinct detail->>'column_assigned') from report_monitor.events where request_id=request and stage='152') <> 4 then
    raise exception 'Unchanged assignment or independent package tracking failed';
  end if;
  perform report_monitor.watch_stage(request,'151');
  insert into atgc.dbp6_0008_dashboard_widgets values ('P1','00000000-0000-0000-0000-000000000001',null,'WGT-001','validated','partial','{"type":"kpi"}');
  insert into atgc.dbp6_0008_dashboard_structures values ('P1','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','{"layout":{}}');
  if (select count(*) from report_monitor.events where request_id=request and stage='151') <> 2 then raise exception '151 outputs missing'; end if;
  perform report_monitor.watch_stage(request,'150');
  insert into atgc.dbp6_0008_weekly_report_sections values ('P1','00000000-0000-0000-0000-000000000001','SEC-001',
    'generated_with_qualifications','{"blocks":[{}]}',to_jsonb('{"generation_status":"completed_with_qualifications"}'::text));
  if not exists(select 1 from report_monitor.events where request_id=request and stage='150'
    and detail->>'generation_status'='completed_with_qualifications' and detail->>'ast_present'='true') then
    raise exception 'Encoded generation metadata was not decoded';
  end if;
  select count(*) into seen from report_monitor.events where request_id=request;
  -- An unexpected source shape must not make the existing n8n write fail.
  update atgc.dbp6_0008_weekly_report_sections set section_ast='{"blocks":42}';
  if (select section_ast->>'blocks' from atgc.dbp6_0008_weekly_report_sections limit 1) <> '42' then
    raise exception 'Observer broke a source write';
  end if;
  perform report_monitor.end_run(request);
  update atgc.dbp6_0008_weekly_report_sections set processing_status='generated';
  if (select count(*) from report_monitor.events where request_id=request) <> seen then raise exception 'Ended monitor recorded new events'; end if;
  update report_monitor.runs set expires_at=now()-interval '1 minute' where request_id=other;
  update second_project.dbp6_0008_weekly_reports_calculations set baseline_progress_package='{}';
  if exists(select 1 from report_monitor.events where request_id=other) then raise exception 'Expired monitor recorded writes'; end if;
  if has_schema_privilege('anon','report_monitor','USAGE') or has_function_privilege('anon','report_monitor.install(text)','EXECUTE') then
    raise exception 'Anonymous access was granted';
  end if;
end;
$$;
select 'PASS: approval, dynamic mappings, schema isolation, unchanged writes, stages, encoded JSON, expiry, access restrictions' as result;
