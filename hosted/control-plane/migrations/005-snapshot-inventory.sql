create table snapshot_objects (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  state text not null default 'active' check (state in ('active','deleting','deleted')),
  file_hashes text[],
  file_count integer,
  total_bytes bigint,
  legacy boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  check ((file_hashes is null and file_count is null and total_bytes is null) or
    (file_hashes is not null and file_count between 0 and 10000 and total_bytes between 0 and 100000000))
);
create table snapshot_captures (
  id uuid primary key,
  user_id uuid not null,
  tenant_id uuid,
  job_id uuid,
  job_fence bigint,
  kind text not null check (kind in ('onboarding','profile','job')),
  snapshot_id text references snapshot_objects(id),
  state text not null default 'preparing' check (state in ('preparing','uploading','ready','failed')),
  lease_token uuid,
  lease_until timestamptz not null,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  error_code text check (error_code in ('capture_failed','capture_interrupted')),
  check ((state in ('preparing','uploading') and lease_token is not null and finished_at is null) or
    (state in ('ready','failed') and lease_token is null and finished_at is not null)),
  check (state <> 'ready' or snapshot_id is not null)
);
create index snapshot_captures_owner on snapshot_captures(user_id,started_at);
create index snapshot_captures_object on snapshot_captures(snapshot_id);
create index snapshot_captures_unresolved on snapshot_captures(lease_until) where state in ('preparing','uploading');
-- Historical committed references are not fabricated capture/ownership records.
create table snapshot_legacy_references (
  snapshot_id text not null references snapshot_objects(id),
  tenant_id uuid not null,
  primary key(snapshot_id,tenant_id)
);
insert into snapshot_objects(id,legacy)
  select snapshot,true from tenants union select snapshot,true from workspace_versions
  union select base_snapshot,true from jobs where base_snapshot is not null;
insert into snapshot_legacy_references(snapshot_id,tenant_id)
  select snapshot,id from tenants union select snapshot,tenant_id from workspace_versions
  union select base_snapshot,tenant_id from jobs where base_snapshot is not null;
revoke all on snapshot_objects,snapshot_captures,snapshot_legacy_references from public;
