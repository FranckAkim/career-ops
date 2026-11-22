-- Keep ephemeral search retention working after the local polling loop retires.
create function hosted_discovery_cleanup() returns integer
language sql security definer set search_path=pg_catalog,public as $$
 with removed as (delete from public.discovery_runs where expires_at<clock_timestamp() returning 1)
 select count(*)::integer from removed;
$$;
revoke all on function hosted_discovery_cleanup() from public;
grant execute on function hosted_discovery_cleanup() to career_discovery;
