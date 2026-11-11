-- Disposable PostgreSQL only. Test harness must strip only CREATE EXTENSION
-- from migration 002 and pass its path as -v migration_path=/tmp/request.sql.
-- The pg_net interface below is a mock: NO external HTTP requests are made.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create table public.p6_project_mapping(schema_name text,dgt_projectid text);
insert into public.p6_project_mapping values ('atgc','P1'),('other_schema','P2');
create schema net;
create table net.mock_queue(id bigint generated always as identity, url text, headers jsonb, body jsonb);
create table net._http_response(id bigint,status_code integer,timed_out boolean,error_msg text);
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
returns bigint language sql as $$
  insert into net.mock_queue(url,headers,body) values(url,headers,body) returning id;
$$;
\i :migration_path

insert into report_requests_private.allowed_projects values ('atgc','P1',true),('other_schema','P2',false),('bad_schema','P3',true);
do $$
declare
  request uuid := gen_random_uuid(); token uuid := gen_random_uuid(); result jsonb; http_id bigint;
begin
  begin
    perform public.dbp6_weekly_report_request('other_schema','P2',gen_random_uuid(),gen_random_uuid());
    raise exception 'disabled project allowed';
  exception when raise_exception then
    if sqlerrm <> 'Supabase requests are not enabled for this project' then raise; end if;
  end;
  begin
    perform public.dbp6_weekly_report_request('bad_schema','P3',gen_random_uuid(),gen_random_uuid());
    raise exception 'unmapped project allowed';
  exception when raise_exception then
    if sqlerrm <> 'Project/schema mapping not found' then raise; end if;
  end;
  result := public.dbp6_weekly_report_request('atgc','P1',request,token);
  if result->>'request_id' <> request::text or result->>'status' <> 'queued' then raise exception 'No immediate ticket'; end if;
  perform public.dbp6_weekly_report_request('atgc','P1',request,token);
  if (select count(*) from net.mock_queue) <> 1 then raise exception 'Duplicate dispatch'; end if;
  if (select body from net.mock_queue limit 1) <> '{"flow_parameters":{"schema":"atgc","project_id":"P1"}}'::jsonb then raise exception 'Wrong JSON payload'; end if;
  if (select headers from net.mock_queue limit 1) <> '{"Content-Type":"application/json"}'::jsonb then raise exception 'Wrong headers'; end if;
  begin
    perform public.dbp6_weekly_report_request('atgc','P1',gen_random_uuid(),gen_random_uuid());
    raise exception 'Overlapping run allowed';
  exception when raise_exception then
    if sqlerrm not like 'This project has a recent%' then raise; end if;
  end;
  begin
    perform public.dbp6_weekly_report_request_status(request,gen_random_uuid());
    raise exception 'Wrong token allowed';
  exception when raise_exception then
    if sqlerrm <> 'Request not found or access token invalid' then raise; end if;
  end;
  select http_request_id into http_id from report_requests_private.requests where request_id=request;
  insert into net._http_response values(http_id,200,false,null);
  result := public.dbp6_weekly_report_request_status(request,token);
  if result->>'status' <> 'accepted' or result->>'report_ready' <> 'false' then raise exception '200 result wrong or falsely ready'; end if;
  update report_requests_private.requests set status='queued' where request_id=request;
  update net._http_response set status_code=202;
  if public.dbp6_weekly_report_request_status(request,token)->>'status' <> 'accepted' then raise exception '202 rejected'; end if;
  update report_requests_private.requests set status='queued' where request_id=request;
  update net._http_response set status_code=524;
  if public.dbp6_weekly_report_request_status(request,token)->>'status' <> 'dispatch_uncertain' then raise exception '524 falsely treated as conclusive'; end if;
  update report_requests_private.requests set status='queued' where request_id=request;
  update net._http_response set status_code=null,timed_out=true,error_msg='timeout';
  if public.dbp6_weekly_report_request_status(request,token)->>'status' <> 'dispatch_uncertain' then raise exception 'Timeout status wrong'; end if;
  update report_requests_private.requests set status='queued' where request_id=request;
  update net._http_response set status_code=400,timed_out=false,error_msg=null;
  if public.dbp6_weekly_report_request_status(request,token)->>'status' <> 'rejected' then raise exception '400 accepted'; end if;
  update report_requests_private.requests set status='queued',created_at=clock_timestamp()-interval '3 minutes' where request_id=request;
  delete from net._http_response;
  if public.dbp6_weekly_report_request_status(request,token)->>'status' <> 'dispatch_uncertain' then raise exception 'Missing dispatch response ignored'; end if;
  update report_requests_private.allowed_projects set enabled=true where project_schema='other_schema';
  perform public.dbp6_weekly_report_request('other_schema','P2',gen_random_uuid(),gen_random_uuid());
  if (select count(*) from net.mock_queue) <> 2 then raise exception 'Second schema not supported'; end if;
  if has_table_privilege('anon','report_requests_private.requests','SELECT') then raise exception 'Anonymous table access'; end if;
end $$;
select 'PASS: dynamic mappings, allowlist, idempotency, JSON body, project lock, status capability, 200/202, timeouts and no false readiness' as result;
