create table saved_searches(
 id uuid primary key,
 tenant_id uuid not null references tenants(id) on delete cascade,
 user_id uuid not null,
 name text not null check(length(name) between 1 and 80),
 input jsonb not null check(jsonb_typeof(input)='object' and octet_length(input::text)<=24000),
 daily boolean not null default false,
 revision integer not null default 1,
 next_due timestamptz not null default clock_timestamp(),
 last_run_id uuid,
 last_summary jsonb,
 previous_urls jsonb not null default '[]'::jsonb check(jsonb_typeof(previous_urls)='array' and jsonb_array_length(previous_urls)<=50),
 unread boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create index saved_searches_owner on saved_searches(tenant_id,user_id);
create index saved_searches_due on saved_searches(next_due) where daily;
create function hosted_saved_search_guard() returns trigger language plpgsql as $$
begin
 perform hosted_workspace_active(NEW.tenant_id);perform hosted_account_active(NEW.user_id);
 if not exists(select 1 from memberships where tenant_id=NEW.tenant_id and user_id=NEW.user_id) then raise exception using errcode='P0001',message='not_found';end if;
 if TG_OP='INSERT' then
  if (select count(*) from saved_searches where tenant_id=NEW.tenant_id and user_id=NEW.user_id)>=5 then raise exception using errcode='P0001',message='saved_search_limit';end if;
 elsif (NEW.id,NEW.tenant_id,NEW.user_id,NEW.input,NEW.created_at) is distinct from (OLD.id,OLD.tenant_id,OLD.user_id,OLD.input,OLD.created_at) then
  raise exception using errcode='P0001',message='immutable_saved_search';
 end if;
 if TG_OP='UPDATE' then NEW.revision:=OLD.revision+1;NEW.updated_at:=clock_timestamp();end if;
 return NEW;
end $$;
create trigger saved_search_guard before insert or update on saved_searches for each row execute function hosted_saved_search_guard();
revoke all on saved_searches from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='career_web') then grant select,insert,delete on saved_searches to career_web;grant update(name,daily,unread,last_run_id,next_due) on saved_searches to career_web;end if;
end $$;

-- Runs created by a saved search publish a bounded in-app summary atomically.
create function hosted_saved_search_result() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare item record; urls jsonb; count_new integer;
begin
 if NEW.state not in ('succeeded','failed','cancelled') or NEW.state=OLD.state then return NEW;end if;
 select * into item from public.saved_searches where last_run_id=NEW.id and tenant_id=NEW.tenant_id and user_id=NEW.user_id for update;
 if not found then return NEW;end if;
 if NEW.state='succeeded' then
  select coalesce(jsonb_agg(j->>'url'),'[]'::jsonb) into urls from (select j from jsonb_array_elements(NEW.result->'jobs') j limit 50) q;
  select count(*) into count_new from jsonb_array_elements_text(urls) as candidate(url) where not (item.previous_urls ? candidate.url);
  update public.saved_searches set previous_urls=urls,unread=true,last_summary=jsonb_build_object('state',NEW.state,'checkedAt',NEW.result->>'checkedAt','completedAt',clock_timestamp(),'count',jsonb_array_length(urls),'newCount',count_new,'partial',NEW.result->'partial') where id=item.id;
 else
  update public.saved_searches set unread=true,last_summary=jsonb_build_object('state',NEW.state,'completedAt',clock_timestamp()) where id=item.id;
 end if;
 return NEW;
end $$;
create trigger saved_search_result after update of state on discovery_runs for each row execute function hosted_saved_search_result();
revoke all on function hosted_saved_search_result() from public;

-- Private scheduler receives only opaque discovery IDs. It cannot read CVs.
create function hosted_saved_search_schedule() returns setof uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare item record; run uuid;
begin
 for item in select s.id,s.tenant_id,s.user_id from public.saved_searches s
  where s.daily and s.next_due<=clock_timestamp()
  and not exists(select 1 from public.account_tombstones a where a.user_id=s.user_id and a.active)
  and not exists(select 1 from public.workspace_tombstones w where w.tenant_id=s.tenant_id and w.active)
  order by s.next_due,s.id limit 100
 loop
  begin
  perform 1 from public.tenants where id=item.tenant_id for update skip locked;
  if not found then continue;end if;
  perform public.hosted_account_active(item.user_id);
  if not exists(select 1 from public.memberships where tenant_id=item.tenant_id and user_id=item.user_id) then continue;end if;
  if exists(select 1 from public.discovery_runs where tenant_id=item.tenant_id and user_id=item.user_id and state in ('queued','running')) then continue;end if;
  if (select count(*) from public.discovery_runs where tenant_id=item.tenant_id and created_at>clock_timestamp()-interval '1 hour')>=10 then continue;end if;
  select * into item from public.saved_searches where id=item.id and daily and next_due<=clock_timestamp() for update;
  if not found then continue;end if;
  run:=gen_random_uuid();
  insert into public.discovery_runs(id,tenant_id,user_id,input) values(run,item.tenant_id,item.user_id,item.input);
  update public.saved_searches set last_run_id=run,next_due=((date_trunc('day',clock_timestamp() at time zone 'UTC')+interval '1 day 6 hours') at time zone 'UTC') where id=item.id;
  exception when sqlstate 'P0001' then
   if SQLERRM<>'account_deleting' then raise;end if;
  end;
 end loop;
 -- Includes queued notifications lost on a previous dispatch attempt.
 return query select r.id from public.discovery_runs r join public.saved_searches s on s.last_run_id=r.id and s.tenant_id=r.tenant_id and s.user_id=r.user_id
 where r.state='queued' and r.expires_at>clock_timestamp() order by r.created_at limit 100;
end $$;
revoke all on function hosted_saved_search_schedule() from public;
grant execute on function hosted_saved_search_schedule() to career_discovery;

-- Preserve the private deletion RPC identity and its existing checks/grants.
-- Extend its reviewed metadata set so saved-search edits invalidate stale scope.
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('hosted_deletion_scope(uuid)'::regprocedure);
 if position('return scope;' in definition)=0 then raise exception 'deletion_scope_contract_changed';end if;
 definition:=replace(definition,'return scope;',
 'if (select count(*) from public.saved_searches where user_id=p_user)>5 then raise exception using errcode=''P0001'',message=''scope_review_required'';end if;
 scope:=scope||jsonb_build_object(''savedSearches'',coalesce((select jsonb_agg(jsonb_build_object(''id'',id,''revision'',revision) order by id) from public.saved_searches where user_id=p_user),''[]''::jsonb));
 return scope;');
 execute definition;
end $migration$;

create or replace function hosted_preview_deletion(p_user uuid,p_session text,p_tenant uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare scope jsonb;
begin
 if not exists(select 1 from public.auth_sessions where id::text=p_session and "userId"::text=p_user::text and "createdAt">=clock_timestamp()-interval '10 minutes' and "expiresAt">clock_timestamp()) then raise exception using errcode='P0001',message='reauthentication_required';end if;
 scope:=public.hosted_deletion_scope(p_user);
 if scope->>'tenantId' is distinct from p_tenant::text then raise exception using errcode='P0001',message='not_found';end if;
 return jsonb_build_object('scopeHash',encode(sha256(convert_to(scope::text,'UTF8')),'hex'),'tenantId',p_tenant,'counts',jsonb_build_object('profiles',jsonb_array_length(scope->'drafts'),'jobs',jsonb_array_length(scope->'jobs'),'captures',jsonb_array_length(scope->'captures'),'savedJobs',jsonb_array_length(scope->'savedJobs'),'savedSearches',jsonb_array_length(scope->'savedSearches')),'physicalDeletionAvailable',false);
end $$;
revoke all on function hosted_preview_deletion(uuid,text,uuid) from public;
