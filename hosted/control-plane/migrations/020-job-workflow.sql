-- Private user-authored planning metadata; application status remains canonical.
alter table saved_jobs add column workflow jsonb not null default '{}'::jsonb
 check(jsonb_typeof(workflow)='object' and octet_length(workflow::text)<=24000);
do $$ begin
 if exists(select 1 from pg_roles where rolname='career_web') then grant update(workflow) on saved_jobs to career_web;end if;
end $$;
-- Existing saved_job_guard increments revision for every metadata update.
-- Deletion scope already includes that revision; export includes this column.
