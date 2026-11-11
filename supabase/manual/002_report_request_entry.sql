-- Independent of 001: no monitoring triggers required. Demo request entry for
-- webhook 149 ONLY. 200/202 is accepted, never report-ready. Run once as admin.
begin;
create extension if not exists pg_net with schema extensions;
create schema report_requests_private;
revoke all on schema report_requests_private from public, anon, authenticated;

create table report_requests_private.allowed_projects (
  project_schema text not null,
  project_id text not null,
  enabled boolean not null default false,
  primary key(project_schema, project_id)
);
create table report_requests_private.requests (
  request_id uuid primary key,
  access_token uuid not null,
  project_schema text not null,
  project_id text not null,
  status text not null check(status in ('queued','accepted','dispatch_uncertain','rejected','closed')),
  http_request_id bigint,
  http_status integer,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create unique index one_open_report_request_per_project
  on report_requests_private.requests(project_schema, project_id) where status <> 'closed';
alter table report_requests_private.allowed_projects enable row level security;
alter table report_requests_private.requests enable row level security;
revoke all on all tables in schema report_requests_private from public, anon, authenticated;

create function public.dbp6_weekly_report_request(
  p_schema text, p_project_id text, p_request_id uuid, p_access_token uuid
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare existing report_requests_private.requests%rowtype; queued_http_id bigint;
begin
  if p_request_id is null or p_access_token is null or p_schema is null or p_project_id is null then
    raise exception 'Request ID, access token, schema and project are required';
  end if;
  -- Serializes submissions for this project, including requests from other tabs.
  perform pg_advisory_xact_lock(hashtextextended(p_schema || ':' || p_project_id, 0));
  select * into existing from report_requests_private.requests where request_id=p_request_id;
  if found then
    if existing.access_token <> p_access_token or existing.project_schema <> p_schema or existing.project_id <> p_project_id then
      raise exception 'Request could not be recovered';
    end if;
    return jsonb_build_object('request_id',existing.request_id,'status',existing.status);
  end if;
  if p_schema in ('public','report_requests_private','report_monitor','information_schema') or p_schema like 'pg\_%' escape '\' then
    raise exception 'Select a project schema';
  end if;
  if not exists(select 1 from report_requests_private.allowed_projects
    where project_schema=p_schema and project_id=p_project_id and enabled) then
    raise exception 'Supabase requests are not enabled for this project';
  end if;
  if not exists(select 1 from public.p6_project_mapping where schema_name=p_schema and dgt_projectid=p_project_id) then
    raise exception 'Project/schema mapping not found';
  end if;
  if exists(select 1 from report_requests_private.requests where project_schema=p_schema and project_id=p_project_id
    and (status <> 'closed' or created_at > clock_timestamp()-interval '1 minute')) then
    raise exception 'This project has a recent or unresolved request. Check it before submitting again.';
  end if;
  insert into report_requests_private.requests(request_id,access_token,project_schema,project_id,status)
    values(p_request_id,p_access_token,p_schema,p_project_id,'queued');
  -- pg_net sends AFTER this transaction commits. The endpoint is fixed: callers
  -- cannot turn the function into an arbitrary HTTP proxy.
  select net.http_post(
    url := 'https://pmc2p2c.app.n8n.cloud/webhook/5de723d8-6d7e-4439-aa88-2a13a1a45536',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('flow_parameters',jsonb_build_object('schema',p_schema,'project_id',p_project_id)),
    timeout_milliseconds := 10000
  ) into queued_http_id;
  update report_requests_private.requests set http_request_id=queued_http_id where request_id=p_request_id;
  return jsonb_build_object('request_id',p_request_id,'status','queued');
end;
$$;

create function public.dbp6_weekly_report_request_status(p_request_id uuid, p_access_token uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare request report_requests_private.requests%rowtype; response record;
begin
  select * into request from report_requests_private.requests
    where request_id=p_request_id and access_token=p_access_token for update;
  if not found then raise exception 'Request not found or access token invalid'; end if;
  if request.status='queued' then
    select status_code,timed_out,error_msg into response from net._http_response where id=request.http_request_id;
    if found then
      request.http_status := response.status_code;
      request.status := case
        when not coalesce(response.timed_out,false) and response.error_msg is null and response.status_code in (200,202) then 'accepted'
        when coalesce(response.timed_out,false) or response.error_msg is not null or response.status_code in (502,503,504,524) or response.status_code is null then 'dispatch_uncertain'
        else 'rejected' end;
    elsif request.created_at < clock_timestamp()-interval '2 minutes' then
      request.status := 'dispatch_uncertain';
    end if;
    update report_requests_private.requests set status=request.status, http_status=request.http_status, updated_at=clock_timestamp()
      where request_id=p_request_id;
  end if;
  return jsonb_build_object('request_id',request.request_id,'status',request.status,'webhook_id','149',
    'http_status',request.http_status,'report_ready',false);
end;
$$;
revoke all on function public.dbp6_weekly_report_request(text,text,uuid,uuid) from public;
revoke all on function public.dbp6_weekly_report_request_status(uuid,uuid) from public;
grant execute on function public.dbp6_weekly_report_request(text,text,uuid,uuid) to anon, authenticated;
grant execute on function public.dbp6_weekly_report_request_status(uuid,uuid) to anon, authenticated;
commit;
