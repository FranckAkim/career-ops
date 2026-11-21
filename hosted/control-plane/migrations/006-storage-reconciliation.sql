create table storage_reconciliation_runs (
  id uuid primary key,
  state text not null default 'scanning' check (state in ('scanning','complete','failed')),
  cursor text,
  pages integer not null default 0 check (pages between 0 and 1000),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  error_code text check (error_code in ('storage_list_failed','invalid_listing','scan_limit')),
  check (state<>'complete' or finished_at is not null)
);
create table storage_reconciliation_objects (
  run_id uuid not null references storage_reconciliation_runs(id),
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  snapshot_id text check (snapshot_id ~ '^[a-f0-9]{64}$'),
  kind text not null check (kind in ('file','manifest','unrecognized')),
  file_hash text check (file_hash ~ '^[a-f0-9]{64}$'),
  bytes bigint not null check (bytes>=0),
  uploaded_at timestamptz not null,
  changed_during_scan boolean not null default false,
  primary key(run_id,key_hash)
);
create index storage_reconciliation_snapshot on storage_reconciliation_objects(run_id,snapshot_id);
-- Operator-only journal. Do not grant these tables to the web/worker roles.
revoke all on storage_reconciliation_runs,storage_reconciliation_objects from public;
