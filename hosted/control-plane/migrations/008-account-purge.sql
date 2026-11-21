alter table account_deletion_requests drop constraint account_deletion_requests_state_check;
alter table account_deletion_requests add constraint account_deletion_requests_state_check check(state in ('blocked_pending_review','purging','complete','cancelled'));
alter table account_deletion_requests add column completed_at timestamptz;
drop index account_deletion_active;
create unique index account_deletion_active on account_deletion_requests(user_id) where state in ('blocked_pending_review','purging');
create table account_purge_items (
 request_id uuid not null references account_deletion_requests(id),
 snapshot_id text not null references snapshot_objects(id),
 file_hashes text[] not null,
 state text not null default 'pending' check(state in ('pending','deleting','deleted','shared')),
 next_key integer not null default 0 check(next_key>=0),
 primary key(request_id,snapshot_id)
);
revoke all on account_purge_items from public;
create function hosted_snapshot_reference_guard() returns trigger language plpgsql as $$
declare object_state text;
begin
 perform pg_advisory_xact_lock(hashtextextended(NEW.snapshot,847293));
 select state into object_state from snapshot_objects where id=NEW.snapshot for share;
 if object_state is not null and object_state<>'active' then raise exception using errcode='P0001',message='snapshot_unavailable';end if;
 return NEW;
end $$;
create trigger snapshot_reference_tenant_guard before insert or update of snapshot on tenants for each row execute function hosted_snapshot_reference_guard();
create trigger snapshot_reference_version_guard before insert on workspace_versions for each row execute function hosted_snapshot_reference_guard();
