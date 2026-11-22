-- Durable bookmarks, separate from applications/canonical engine files.
create table saved_jobs(
 id uuid primary key,
 tenant_id uuid not null references tenants(id) on delete cascade,
 user_id uuid not null,
 url_hash text not null check(url_hash ~ '^[a-f0-9]{64}$'),
 posting jsonb not null check(octet_length(posting::text)<=140000),
 shortlisted boolean not null default false,
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(tenant_id,user_id,url_hash),
 check(url_hash=encode(sha256(convert_to(posting->>'url','UTF8')),'hex'))
);
create index saved_jobs_owner on saved_jobs(tenant_id,user_id,created_at desc);
create function hosted_saved_job_guard() returns trigger language plpgsql as $$
begin
 perform hosted_workspace_active(NEW.tenant_id);perform hosted_account_active(NEW.user_id);
 if not exists(select 1 from memberships where tenant_id=NEW.tenant_id and user_id=NEW.user_id) then raise exception using errcode='P0001',message='not_found';end if;
 if TG_OP='UPDATE' then
  if (NEW.id,NEW.tenant_id,NEW.user_id,NEW.url_hash,NEW.posting,NEW.created_at) is distinct from (OLD.id,OLD.tenant_id,OLD.user_id,OLD.url_hash,OLD.posting,OLD.created_at) then raise exception using errcode='P0001',message='immutable_saved_job';end if;
  NEW.revision:=OLD.revision+1;NEW.updated_at:=clock_timestamp();
 end if;
 return NEW;
end $$;
create trigger saved_job_guard before insert or update on saved_jobs for each row execute function hosted_saved_job_guard();
revoke all on saved_jobs from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='career_web') then grant select,insert,delete on saved_jobs to career_web;grant update(shortlisted) on saved_jobs to career_web;end if;
end $$;

-- Runtime may review/request a recent authenticated user's account block, never
-- read or mutate purge/fence ledgers. Physical removal remains operator-only.
create or replace function hosted_deletion_scope(p_user uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid; scope jsonb; n integer;
begin
 select count(*) into n from public.memberships where user_id=p_user;
 if n>1 or exists(select 1 from public.memberships where user_id=p_user and role<>'owner') then raise exception using errcode='P0001',message='shared_workspace_review_required';end if;
 select tenant_id into t from public.memberships where user_id=p_user;
 if t is not null and (not exists(select 1 from public.personal_workspaces where user_id=p_user and tenant_id=t) or (select count(*) from public.memberships where tenant_id=t)<>1) then raise exception using errcode='P0001',message='shared_workspace_review_required';end if;
 if (select count(*) from public.saved_jobs where user_id=p_user)>30 then raise exception using errcode='P0001',message='scope_review_required';end if;
 if (select count(*) from public.profile_drafts where user_id=p_user)>1000 or (select count(*) from public.jobs where tenant_id=t)>10000 or (select count(*) from public.snapshot_captures where user_id=p_user)>20000 then raise exception using errcode='P0001',message='scope_review_required';end if;
 select jsonb_build_object('schema',1,'userId',p_user,'tenantId',t,
 'tenant',(select jsonb_build_object('id',id,'generation',generation::text,'snapshot',snapshot,'recoveryRequired',recovery_required) from public.tenants where id=t),
 'drafts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'reviewHash',review_hash,'confirmedAt',confirmed_at) order by id) from public.profile_drafts where user_id=p_user),'[]'::jsonb),
 'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'status',status,'fence',fence::text) order by id) from public.jobs where tenant_id=t),'[]'::jsonb),
 'savedJobs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'urlHash',url_hash,'shortlisted',shortlisted) order by id) from public.saved_jobs where user_id=p_user and tenant_id=t),'[]'::jsonb),
 'captures',coalesce((select jsonb_agg(jsonb_build_object('id',id,'snapshot',snapshot_id,'state',state) order by id) from public.snapshot_captures where user_id=p_user),'[]'::jsonb)) into scope;
 return scope;
end $$;
revoke all on function hosted_deletion_scope(uuid) from public;
create or replace function hosted_preview_deletion(p_user uuid,p_session text,p_tenant uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare scope jsonb;
begin
 if not exists(select 1 from public.auth_sessions where id::text=p_session and "userId"::text=p_user::text and "createdAt">=clock_timestamp()-interval '10 minutes' and "expiresAt">clock_timestamp()) then raise exception using errcode='P0001',message='reauthentication_required';end if;
 scope:=public.hosted_deletion_scope(p_user);
 if scope->>'tenantId' is distinct from p_tenant::text then raise exception using errcode='P0001',message='not_found';end if;
 return jsonb_build_object('scopeHash',encode(sha256(convert_to(scope::text,'UTF8')),'hex'),'tenantId',p_tenant,'counts',jsonb_build_object('profiles',jsonb_array_length(scope->'drafts'),'jobs',jsonb_array_length(scope->'jobs'),'captures',jsonb_array_length(scope->'captures'),'savedJobs',jsonb_array_length(scope->'savedJobs')),'physicalDeletionAvailable',false);
end $$;
revoke all on function hosted_preview_deletion(uuid,text,uuid) from public;
