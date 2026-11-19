create table profile_drafts (
  id uuid primary key,
  user_id uuid not null,
  revision integer not null default 1 check (revision > 0),
  review_hash text not null check (review_hash ~ '^[a-f0-9]{64}$'),
  content jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz
);
create index profile_drafts_owner on profile_drafts(user_id,updated_at desc);
create table personal_workspaces (
  user_id uuid primary key,
  tenant_id uuid not null unique references tenants(id),
  draft_id uuid not null unique references profile_drafts(id),
  review_hash text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index memberships_user on memberships(user_id,tenant_id);
create index jobs_tenant_history on jobs(tenant_id,created_at desc,id desc);
revoke all on profile_drafts,personal_workspaces from public;
