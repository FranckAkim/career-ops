-- Ephemeral read-only scanner requests; never canonical workspace mutations.
create table discovery_runs(
 id uuid primary key,
 tenant_id uuid not null references tenants(id) on delete cascade,
 user_id uuid not null,
 input jsonb not null,
 state text not null default 'queued' check(state in ('queued','running','succeeded','failed','cancelled')),
 claim uuid,
 result jsonb,
 error_code text,
 created_at timestamptz not null default clock_timestamp(),
 lease_until timestamptz,
 expires_at timestamptz not null default clock_timestamp()+interval '24 hours'
);
create index discovery_runs_queue on discovery_runs(created_at) where state='queued';
create index discovery_runs_owner on discovery_runs(tenant_id,user_id,created_at);
create function hosted_discovery_guard() returns trigger language plpgsql as $$
begin
 if NEW.state in ('queued','running','succeeded') then
  perform hosted_workspace_active(NEW.tenant_id);perform hosted_account_active(NEW.user_id);
  if not exists(select 1 from memberships where tenant_id=NEW.tenant_id and user_id=NEW.user_id) then raise exception using errcode='P0001',message='not_found';end if;
 end if;
 return NEW;
end $$;
create trigger discovery_guard before insert or update on discovery_runs for each row execute function hosted_discovery_guard();
-- Search metadata is disposable. Blocking an account removes its pending/results
-- atomically; a cancelled/old local worker cannot republish deleted rows.
create function hosted_discovery_block() returns trigger language plpgsql as $$
begin
 if NEW.active then delete from discovery_runs where user_id=NEW.user_id;end if;return NEW;
end $$;
create trigger discovery_account_block after insert or update on account_tombstones for each row execute function hosted_discovery_block();
revoke all on discovery_runs from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='career_web') then grant select,insert,delete on discovery_runs to career_web;grant update(state,result,error_code) on discovery_runs to career_web;end if;
 if exists(select 1 from pg_roles where rolname='career_worker') then grant select,delete on discovery_runs to career_worker;grant update(state,claim,result,error_code,lease_until) on discovery_runs to career_worker;end if;
end $$;
