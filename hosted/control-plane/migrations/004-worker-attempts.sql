-- Operator-only lifecycle journal; never return sandbox identifiers to tenants.
create table worker_attempts (
  name text primary key check (name ~ '^hc-[0-9a-f-]{36}$'),
  job_id uuid not null references jobs(id),
  fence bigint not null,
  session_id text,
  state text not null check (state in ('creating','running','stopped')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(job_id, fence)
);
create index worker_attempts_cleanup on worker_attempts(created_at) where state <> 'stopped';
