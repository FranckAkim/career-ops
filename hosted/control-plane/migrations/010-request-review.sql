alter table account_request_activity add column deployment_id text
 check(deployment_id is null or deployment_id ~ '^dpl_[A-Za-z0-9]{20,64}$');
alter table account_request_activity add column instance_id uuid;
alter table account_request_activity add constraint request_execution_identity
 check((deployment_id is null)=(instance_id is null));
alter table account_request_activity drop constraint account_request_activity_state_check;
alter table account_request_activity drop constraint account_request_activity_check;
alter table account_request_activity add constraint request_activity_state
 check(state in ('active','settled','terminated'));
alter table account_request_activity add constraint request_activity_completion
 check((state='active' and settled_at is null) or (state in ('settled','terminated') and settled_at is not null));

-- Minimal opaque security audit survives application-data cleanup. No raw proof,
-- logs, request headers, source text or bearer credentials belong here.
create table account_request_resolutions (
 activity_id uuid primary key,
 request_id uuid not null references account_deletion_requests(id),
 user_id uuid not null,
 deployment_id text not null,
 instance_id uuid not null,
 review_hash text not null check(review_hash ~ '^[a-f0-9]{64}$'),
 evidence_hash text not null check(evidence_hash ~ '^[a-f0-9]{64}$'),
 verified_at timestamptz not null default clock_timestamp()
);
revoke all on account_request_resolutions from public;

create or replace function hosted_request_activity_guard() returns trigger language plpgsql as $$
begin
 if TG_OP='INSERT' then
  perform hosted_account_active(NEW.user_id);
  if NEW.state<>'active' then raise exception 'invalid_request_activity';end if;
 else
  if NEW.id<>OLD.id or NEW.user_id<>OLD.user_id or NEW.started_at<>OLD.started_at
    or NEW.deployment_id is distinct from OLD.deployment_id
    or NEW.instance_id is distinct from OLD.instance_id
    or OLD.state<>'active' or NEW.state not in ('settled','terminated') then
   raise exception 'invalid_request_activity';
  end if;
  if NEW.state='terminated' then
   -- Invoker permissions intentionally deny this branch to runtime roles.
   if not exists(select 1 from account_request_resolutions r
     join account_tombstones t on t.user_id=r.user_id and t.request_id=r.request_id and t.active
     where r.activity_id=NEW.id and r.user_id=NEW.user_id
       and r.deployment_id=NEW.deployment_id and r.instance_id=NEW.instance_id) then
    raise exception 'termination_evidence_required';
   end if;
  end if;
 end if;
 return NEW;
end $$;
