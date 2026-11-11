-- Phase 1: administrator-only observation. No webhook calls, jobs, or automatic
-- sequencing. Run in the Supabase SQL editor as the database administrator.
begin;

create schema if not exists report_monitor;
revoke all on schema report_monitor from public, anon, authenticated;

create table report_monitor.runs (
  request_id uuid primary key default gen_random_uuid(),
  project_schema text not null,
  project_id text not null,
  report_id uuid not null,
  week_num integer,
  design_id uuid not null,
  expected_sections text[] not null,
  expected_appendices text[] not null,
  design_snapshot jsonb not null,
  stage text not null default '149' check (stage in ('149','152','151','150')),
  status text not null default 'observing' check (status in ('observing','ended','expired')),
  started_at timestamptz not null default clock_timestamp(),
  stage_started_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '30 minutes'
);
create unique index report_monitor_one_observer_per_project
  on report_monitor.runs(project_schema, project_id) where status = 'observing';

create table report_monitor.events (
  event_id bigint generated always as identity primary key,
  request_id uuid not null references report_monitor.runs on delete cascade,
  stage text not null,
  observed_at timestamptz not null default clock_timestamp(),
  source_table text not null,
  operation text not null,
  output_id text,
  detail jsonb not null default '{}'::jsonb
);
create index on report_monitor.events(request_id, stage, observed_at);
alter table report_monitor.runs enable row level security;
alter table report_monitor.events enable row level security;
revoke all on all tables in schema report_monitor from public, anon, authenticated;
revoke all on all sequences in schema report_monitor from public, anon, authenticated;

-- Inputs in the supplied exports sometimes contain JSON encoded as strings.
create function report_monitor.decode_json(value jsonb) returns jsonb
language plpgsql immutable set search_path = pg_catalog as $$
declare result jsonb := value;
begin
  for i in 1..6 loop
    exit when jsonb_typeof(result) is distinct from 'string';
    begin result := (result #>> '{}')::jsonb;
    exception when invalid_text_representation then return null;
    end;
  end loop;
  return result;
end;
$$;

-- Called by AFTER triggers only. Metadata is retained; source packages, photos,
-- narrative content and financial amounts are never copied into the event log.
create function report_monitor.observe_write() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
declare
  row_data jsonb := to_jsonb(new);
  run report_monitor.runs%rowtype;
  details jsonb;
  label text := tg_argv[0];
begin
  select * into run from report_monitor.runs r
  where r.project_schema = tg_table_schema
    and r.project_id = row_data->>'project_id'
    and r.report_id::text = row_data->>'report_id'
    and r.status = 'observing' and r.expires_at > clock_timestamp()
    and (label = 'any' or r.stage = label)
  for share;
  if not found then return new; end if;

  if tg_table_name = 'dbp6_0008_weekly_reports_calculations' then
    details := jsonb_build_object('column_assigned', tg_argv[1]);
    -- Column-specific UPDATE OF triggers also observe assignments of unchanged
    -- values. This is evidence of a write, not proof a package is fully ready.
    if run.stage = '152' and label <> '152' then return new; end if;
  elsif tg_table_name = 'dbp6_0008_dashboard_widgets' then
    if run.stage <> '151' then return new; end if;
    details := jsonb_build_object(
      'structure_id', row_data->>'structure_id',
      'processing_status', row_data->>'processing_status',
      'data_status', row_data->>'data_status',
      'ast_present', coalesce(report_monitor.decode_json(row_data->'widget_ast') not in ('null'::jsonb, '{}'::jsonb), false));
  elsif tg_table_name = 'dbp6_0008_dashboard_structures' then
    if run.stage <> '151' then return new; end if;
    details := jsonb_build_object(
      'structure_id', row_data->>'structure_id',
      'a3_layout_assigned', true,
      'a3_layout_present', coalesce(report_monitor.decode_json(row_data->'a3_layout') not in ('null'::jsonb, '{}'::jsonb), false));
  else
    if run.stage <> '150' then return new; end if;
    details := jsonb_build_object(
      'processing_status', row_data->>'processing_status',
      'generation_status', report_monitor.decode_json(row_data->'generation_metadata')->>'generation_status',
      'ast_present', coalesce(jsonb_array_length(report_monitor.decode_json(row_data->'section_ast')->'blocks'), 0) > 0);
  end if;

  insert into report_monitor.events(request_id, stage, source_table, operation, output_id, detail)
  values (run.request_id, run.stage, tg_table_name, tg_op,
    coalesce(row_data->>'widget_id', row_data->>'section_id', row_data->>'structure_id', row_data->>'report_id'), details);
  return new;
exception when others then
  -- Monitoring must not break the existing generator's writes. Any missing
  -- evidence remains unconfirmed; it is never promoted to successful completion.
  raise warning 'Report monitor could not record an observation (SQLSTATE %)', sqlstate;
  return new;
end;
$$;

-- Explicitly install for a selected project schema, never every schema at once.
-- All four tables/required columns must exist; failure rolls back installation.
create function report_monitor.install(project_schema text) returns void
language plpgsql security invoker set search_path = pg_catalog as $$
declare item record;
begin
  if project_schema in ('public','report_monitor','information_schema') or project_schema like 'pg\_%' escape '\'
    or not exists(select 1 from pg_namespace where nspname = project_schema) then
    raise exception 'Select an existing project schema';
  end if;
  for item in select * from (values
    ('dbp6_0008_weekly_reports_calculations','rm_calculations','149','calculation_packages','baseline_progress_package, actual_progress_package, planned_kpi_calculations_package, actual_kpi_calculations_package, engineering_status_package, qaqc_hse_package, actual_resources_package, schedule_analysis_package'),
    ('dbp6_0008_weekly_reports_calculations','rm_payment','152','payment_status_package','payment_status_package'),
    ('dbp6_0008_weekly_reports_calculations','rm_variation','152','variation_status_package','variation_status_package'),
    ('dbp6_0008_weekly_reports_calculations','rm_photos','152','progress_photos_package','progress_photos_package'),
    ('dbp6_0008_weekly_reports_calculations','rm_safety','152','safety_statistics_package','safety_statistics_package'),
    ('dbp6_0008_dashboard_widgets','rm_widgets','151','widget','widget_ast, processing_status'),
    ('dbp6_0008_dashboard_structures','rm_structure','151','a3_layout','a3_layout'),
    ('dbp6_0008_weekly_report_sections','rm_sections','150','section','section_ast, processing_status, generation_metadata')
  ) as definitions(table_name, trigger_name, stage, output, columns) loop
    execute format('create trigger %I after insert or update of %s on %I.%I for each row execute function report_monitor.observe_write(%L, %L)',
      item.trigger_name, item.columns, project_schema, item.table_name, item.stage, item.output);
  end loop;
end;
$$;

-- Monitor an EXISTING report for this first validation stage. Uses the same
-- approval/scope preference as the app: report-bound, project, schema-wide.
create function report_monitor.begin_run(project_schema text, project_id text, report_id uuid)
returns uuid language plpgsql security invoker set search_path = pg_catalog as $$
declare
  report jsonb;
  design jsonb;
  sections jsonb;
  section_ids text[];
  appendix_ids text[];
  request uuid;
begin
  if not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname=project_schema and t.tgname='rm_sections' and not t.tgisinternal) then
    raise exception 'Install monitoring in this schema first';
  end if;
  execute format('select to_jsonb(c) from %I.dbp6_0008_weekly_reports_calculations c where c.project_id=$1 and c.report_id=$2', project_schema)
    into report using project_id, report_id;
  if report is null then raise exception 'Report not found in the selected schema/project'; end if;
  execute format('select to_jsonb(d) from %I.dbp6_0008_weekly_report_design d
    where d.is_approved is true and d.is_active is true
      and (d.project_id=$1 or d.project_id is null) and (d.report_id=$2 or d.report_id is null)
      and regexp_replace(lower(d.report_type), ''[^a-z0-9]'', '''', ''g'')=''weeklyprogressreport''
    order by (case when d.report_id=$2 then 4 else 0 end + case when d.project_id=$1 then 2 else 0 end) desc,
      d.updated_at desc nulls last, d.id desc limit 1', project_schema)
    into design using project_id, report_id;
  if design is null then raise exception 'No applicable approved active weekly report design'; end if;
  sections := report_monitor.decode_json(design->'sections');
  select array_agg(distinct v->>'section_id') into section_ids
    from jsonb_array_elements(sections->'section_design_mapping') v where v->>'section_id' is not null;
  select array_agg(distinct v->>'appendix_id') into appendix_ids
    from jsonb_array_elements(sections->'appendix_design_mapping') v where v->>'appendix_id' is not null;
  if coalesce(cardinality(section_ids),0)=0 then raise exception 'Approved design has no section mapping'; end if;
  update report_monitor.runs r set status='expired'
    where r.project_schema=begin_run.project_schema and r.project_id=begin_run.project_id
      and r.status='observing' and r.expires_at <= clock_timestamp();
  insert into report_monitor.runs(project_schema, project_id, report_id, week_num, design_id,
    expected_sections, expected_appendices, design_snapshot)
  values (project_schema, project_id, report_id, (report->>'week_num')::integer, (design->>'design_id')::uuid,
    section_ids, coalesce(appendix_ids, '{}'::text[]), design)
  returning request_id into request;
  return request;
end;
$$;

create function report_monitor.watch_stage(request uuid, next_stage text) returns void
language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if next_stage not in ('149','152','151','150') then raise exception 'Unknown stage'; end if;
  update report_monitor.runs set stage=next_stage, stage_started_at=clock_timestamp()
    where request_id=request and status='observing' and expires_at > clock_timestamp();
  if not found then raise exception 'Observation expired or ended: start a new run'; end if;
end;
$$;

create function report_monitor.end_run(request uuid) returns void
language sql security invoker set search_path = pg_catalog as $$
  update report_monitor.runs set status='ended' where request_id=request and status='observing';
$$;

-- No client RPC is exposed in phase 1. Do not grant browser roles access to these
-- functions/tables: browser-facing submission will need a separate guarded API.
revoke all on all functions in schema report_monitor from public, anon, authenticated;
commit;
