-- A cloud search processor can operate one existing search, never read CVs.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='career_discovery') then
  create role career_discovery nologin nosuperuser nocreatedb nocreaterole noinherit;
 end if;
end $$;
grant usage on schema public to career_discovery;
create function hosted_discovery_claim(p_id uuid,p_claim uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare payload jsonb;
begin
 if p_id is null or p_claim is null then raise exception using errcode='P0001',message='invalid_discovery_claim';end if;
 update public.discovery_runs set state='failed',error_code='scanner_interrupted',result=null
 where id=p_id and state='running' and lease_until<clock_timestamp();
 update public.discovery_runs r set state='running',claim=p_claim,lease_until=clock_timestamp()+interval '30 seconds'
 where r.id=p_id and r.state='queued' and r.expires_at>clock_timestamp()
 and not exists(select 1 from public.account_tombstones a where a.user_id=r.user_id and a.active)
 and not exists(select 1 from public.workspace_tombstones w where w.tenant_id=r.tenant_id and w.active)
 and exists(select 1 from public.memberships m where m.user_id=r.user_id and m.tenant_id=r.tenant_id)
 returning r.input into payload;
 return payload;
end $$;
create function hosted_discovery_heartbeat(p_id uuid,p_claim uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if p_id is null or p_claim is null then raise exception using errcode='P0001',message='invalid_discovery_claim';end if;
 update public.discovery_runs set lease_until=clock_timestamp()+interval '30 seconds'
 where id=p_id and claim=p_claim and state='running' and lease_until>clock_timestamp() and expires_at>clock_timestamp();
 return found;
end $$;
create function hosted_discovery_finish(p_id uuid,p_claim uuid,p_result jsonb,p_failed boolean) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if p_failed is null or p_id is null or p_claim is null then raise exception using errcode='P0001',message='invalid_discovery_claim';end if;
 if not p_failed and (p_result is null or jsonb_typeof(p_result->'jobs') is distinct from 'array' or octet_length(p_result::text)>2200000) then
  raise exception using errcode='P0001',message='invalid_discovery_result';
 end if;
 update public.discovery_runs set state=case when p_failed then 'failed' else 'succeeded' end,
 result=case when p_failed then null else p_result end,error_code=case when p_failed then 'scanner_unavailable' else null end
 where id=p_id and claim=p_claim and state='running' and lease_until>clock_timestamp() and expires_at>clock_timestamp();
 return found;
end $$;
revoke all on function hosted_discovery_claim(uuid,uuid),hosted_discovery_heartbeat(uuid,uuid),hosted_discovery_finish(uuid,uuid,jsonb,boolean) from public;
grant execute on function hosted_discovery_claim(uuid,uuid),hosted_discovery_heartbeat(uuid,uuid),hosted_discovery_finish(uuid,uuid,jsonb,boolean) to career_discovery;
