alter table snapshot_objects drop constraint snapshot_objects_state_check;
alter table snapshot_objects add constraint snapshot_objects_state_check check(state in ('active','deleting','deleted','fencing','fenced'));
alter table account_deletion_requests drop constraint account_deletion_requests_state_check;
alter table account_deletion_requests add constraint account_deletion_requests_state_check check(state in ('blocked_pending_review','fencing','purging','complete','cancelled'));
drop index account_deletion_active;
create unique index account_deletion_active on account_deletion_requests(user_id) where state in ('blocked_pending_review','fencing','purging');
create table snapshot_write_fences (
 request_id uuid not null references account_deletion_requests(id),
 snapshot_id text not null references snapshot_objects(id),
 generation uuid not null,
 file_hashes text[] not null,
 review_hash text not null check(review_hash ~ '^[a-f0-9]{64}$'),
 evidence_hash text not null check(evidence_hash ~ '^[a-f0-9]{64}$'),
 next_key integer not null default 0 check(next_key>=0),
 state text not null default 'fencing' check(state in ('fencing','fenced')),
 primary key(request_id,snapshot_id), unique(snapshot_id)
);
revoke all on snapshot_write_fences from public;
alter table account_purge_items drop constraint account_purge_items_state_check;
alter table account_purge_items add constraint account_purge_items_state_check check(state in ('pending','deleting','deleted','shared','fenced'));
