-- Apply through migrate.mjs, using a dedicated private database/schema.
create table tenants (
  id uuid primary key,
  generation bigint not null default 0 check (generation >= 0),
  snapshot text not null check (snapshot ~ '^[a-f0-9]{64}$'),
  fence bigint not null default 0 check (fence >= 0),
  active_job uuid,
  recovery_required boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
create table memberships (
  tenant_id uuid not null references tenants(id),
  user_id uuid not null,
  role text not null check (role in ('owner', 'member')),
  primary key (tenant_id, user_id)
);
create table jobs (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  requested_by uuid not null,
  idempotency_key text not null check (length(idempotency_key) between 1 and 128),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb not null,
  engine_revision text not null check (engine_revision ~ '^[a-f0-9]{40}$'),
  status text not null default 'queued' check (status in ('queued','running','cancel_requested','cancelled','succeeded','failed','needs_recovery')),
  fence bigint,
  base_generation bigint,
  base_snapshot text,
  lease_until timestamptz,
  result jsonb,
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  unique (tenant_id, idempotency_key),
  unique (tenant_id, id),
  foreign key (tenant_id, requested_by) references memberships(tenant_id, user_id)
);
alter table tenants add constraint active_job_tenant foreign key (id, active_job) references jobs(tenant_id, id);
create index jobs_queue on jobs(tenant_id, created_at, id) where status = 'queued';
create index jobs_expired on jobs(lease_until) where status in ('running','cancel_requested');
create table workspace_versions (
  tenant_id uuid not null references tenants(id),
  generation bigint not null,
  snapshot text not null check (snapshot ~ '^[a-f0-9]{64}$'),
  job_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, generation),
  foreign key (tenant_id, job_id) references jobs(tenant_id, id)
);
create table artifacts (
  tenant_id uuid not null,
  job_id uuid not null,
  path text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  primary key (tenant_id, job_id, path),
  foreign key (tenant_id, job_id) references jobs(tenant_id, id)
);
create table job_events (
  sequence bigint generated always as identity primary key,
  tenant_id uuid not null,
  job_id uuid not null,
  kind text not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (tenant_id, job_id) references jobs(tenant_id, id)
);
create index job_events_read on job_events(tenant_id, job_id, sequence);
-- Only the trusted control-plane role gets access. No browser/anonymous grants.
revoke all on tenants, memberships, jobs, workspace_versions, artifacts, job_events from public;
