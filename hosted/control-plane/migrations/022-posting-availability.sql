alter table saved_jobs add column availability jsonb not null default '{}'::jsonb
 check(jsonb_typeof(availability)='object' and octet_length(availability::text)<=2000);
do $$ begin
 if exists(select 1 from pg_roles where rolname='career_web') then grant update(availability) on saved_jobs to career_web;end if;
end $$;
-- The no-CV claim capability returns only a server-owned posting URL/provider.
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('hosted_discovery_claim(uuid,uuid)'::regprocedure);
 if position('return payload;' in definition)=0 then raise exception 'discovery_claim_contract_changed';end if;
 definition:=replace(definition,'return payload;',
 'if payload->>''kind''=''availability'' then
  select jsonb_build_object(''kind'',''availability'',''url'',s.posting->>''url'',''source'',s.posting->>''source'') into payload
  from public.saved_jobs s join public.discovery_runs r on r.tenant_id=s.tenant_id and r.user_id=s.user_id
  where r.id=p_id and r.claim=p_claim and s.id::text=r.input->>''savedJobId'' and s.posting->>''source''<>''handshake-import'';
  if payload is null then update public.discovery_runs set state=''failed'',error_code=''saved_posting_missing'' where id=p_id and claim=p_claim;end if;
 end if;
 return payload;');
 execute definition;
end $migration$;
create function hosted_availability_result() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare evidence jsonb;
begin
 if NEW.input->>'kind' is distinct from 'availability' or NEW.state not in ('succeeded','failed','cancelled') or NEW.state=OLD.state then return NEW;end if;
 evidence:=NEW.result->'availability';
 if NEW.state<>'succeeded' or coalesce(evidence->>'state','') not in ('active','expired','unknown') or evidence is null then evidence:=jsonb_build_object('state','unknown','checkedAt',clock_timestamp(),'provenance','ats_api','code','check_incomplete');end if;
 update public.saved_jobs set availability=evidence where id::text=NEW.input->>'savedJobId' and tenant_id=NEW.tenant_id and user_id=NEW.user_id;
 return NEW;
end $$;
create trigger availability_result after update of state on discovery_runs for each row execute function hosted_availability_result();
revoke all on function hosted_availability_result() from public;
