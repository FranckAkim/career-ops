-- A lost process leaves an unresolved row. Age is never proof of quiescence.
create table account_request_activity (
 id uuid primary key,
 user_id uuid not null,
 state text not null default 'active' check(state in ('active','settled')),
 started_at timestamptz not null default clock_timestamp(),
 settled_at timestamptz,
 check ((state='active' and settled_at is null) or (state='settled' and settled_at is not null))
);
create index account_request_active on account_request_activity(user_id) where state='active';
create function hosted_request_activity_guard() returns trigger language plpgsql as $$
begin
 if TG_OP='INSERT' then
  perform hosted_account_active(NEW.user_id);
  if NEW.state<>'active' then raise exception 'invalid_request_activity';end if;
 elsif NEW.id<>OLD.id or NEW.user_id<>OLD.user_id or NEW.started_at<>OLD.started_at
   or OLD.state<>'active' or NEW.state<>'settled' then
  raise exception 'invalid_request_activity';
 end if;
 return NEW;
end $$;
create trigger request_activity_guard before insert or update on account_request_activity
 for each row execute function hosted_request_activity_guard();
revoke all on account_request_activity from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='career_web') then
  grant select,insert on account_request_activity to career_web;
  grant update(state,settled_at) on account_request_activity to career_web;
 end if;
end $$;
