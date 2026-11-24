-- User-confirmed observations, not canonical engine stage writes.
-- Attachments are small private database records, never public URLs or model inputs.
alter table saved_jobs add column activity jsonb not null default '[]'::jsonb
 check(jsonb_typeof(activity)='array' and jsonb_array_length(activity)<=20 and octet_length(activity::text)<=1000000);
do $$ begin
 if exists(select 1 from pg_roles where rolname='career_web') then grant update(activity) on saved_jobs to career_web;end if;
end $$;
-- The existing guard increments saved_jobs.revision and enforces account/workspace
-- lifecycle. Deletion scopes include that revision and tenant deletion cascades.
