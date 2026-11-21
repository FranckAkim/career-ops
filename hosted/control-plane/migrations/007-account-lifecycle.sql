create table account_deletion_requests (
 id uuid primary key,
 user_id uuid not null,
 tenant_id uuid,
 scope_hash text not null check(scope_hash ~ '^[a-f0-9]{64}$'),
 session_fingerprint text not null check(session_fingerprint ~ '^[a-f0-9]{64}$'),
 state text not null default 'blocked_pending_review' check(state in ('blocked_pending_review','cancelled')),
 created_at timestamptz not null default clock_timestamp(),
 cancelled_at timestamptz
);
create unique index account_deletion_active on account_deletion_requests(user_id) where state='blocked_pending_review';
create table account_tombstones (
 user_id uuid primary key,
 request_id uuid not null references account_deletion_requests(id),
 active boolean not null default true
);
create table workspace_tombstones (
 tenant_id uuid primary key,
 request_id uuid not null references account_deletion_requests(id),
 active boolean not null default true
);
create function hosted_account_active(p_user uuid) returns void language plpgsql as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,847292));
 if exists(select 1 from account_tombstones where user_id=p_user and active) then
  raise exception using errcode='P0001',message='account_deleting';
 end if;
end $$;
create function hosted_workspace_active(p_tenant uuid) returns void language plpgsql as $$
begin
 if p_tenant is not null then perform 1 from tenants where id=p_tenant for key share;end if;
 if exists(select 1 from workspace_tombstones where tenant_id=p_tenant and active) then
  raise exception using errcode='P0001',message='account_deleting';
 end if;
end $$;
create function hosted_lifecycle_guard() returns trigger language plpgsql as $$
begin
 if TG_TABLE_NAME='jobs' then
  if NEW.status not in ('queued','running','succeeded') then return NEW; end if;
  perform hosted_workspace_active(NEW.tenant_id);perform hosted_account_active(NEW.requested_by);
 elsif TG_TABLE_NAME='snapshot_captures' then
  if NEW.state='failed' then return NEW; end if;
  perform hosted_workspace_active(NEW.tenant_id);perform hosted_account_active(NEW.user_id);
 elsif TG_TABLE_NAME='tenants' then
  perform hosted_workspace_active(NEW.id);
 elsif TG_TABLE_NAME='workspace_versions' then
  perform hosted_workspace_active(NEW.tenant_id);
 else
  if TG_TABLE_NAME in ('personal_workspaces','memberships') then perform hosted_workspace_active(NEW.tenant_id);end if;
  perform hosted_account_active(NEW.user_id);
 end if;
 return NEW;
end $$;
create trigger lifecycle_job_guard before insert or update of status on jobs for each row execute function hosted_lifecycle_guard();
create trigger lifecycle_capture_guard before insert or update of state,snapshot_id,lease_until on snapshot_captures for each row execute function hosted_lifecycle_guard();
create trigger lifecycle_source_guard before update of snapshot,generation on tenants for each row execute function hosted_lifecycle_guard();
create trigger lifecycle_version_guard before insert on workspace_versions for each row execute function hosted_lifecycle_guard();
create trigger lifecycle_draft_guard before insert or update on profile_drafts for each row execute function hosted_lifecycle_guard();
create trigger lifecycle_personal_guard before insert or update on personal_workspaces for each row execute function hosted_lifecycle_guard();
create trigger lifecycle_member_guard before insert or update on memberships for each row execute function hosted_lifecycle_guard();
create function hosted_auth_session_guard() returns trigger language plpgsql as $$
begin
 perform hosted_account_active(NEW."userId"::uuid);return NEW;
end $$;
do $$ begin
 if to_regclass('auth_sessions') is not null then
  execute 'create trigger lifecycle_auth_session_guard before insert or update on auth_sessions for each row execute function hosted_auth_session_guard()';
 end if;
end $$;
revoke all on account_deletion_requests,account_tombstones,workspace_tombstones from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='career_web') then grant select on account_tombstones,workspace_tombstones to career_web;end if;
 if exists(select 1 from pg_roles where rolname='career_worker') then grant select on account_tombstones,workspace_tombstones to career_worker;end if;
end $$;
