-- Register generation identity before any remote upload; older unknown records
-- are deliberately not reclassified from storage presence or timestamps.
alter table snapshot_objects add column manifest_schema integer;
alter table snapshot_objects add column manifest_generation uuid;
alter table snapshot_objects add constraint snapshot_generation_contract check (
 (manifest_schema is null and manifest_generation is null) or
 (manifest_schema is not null and ((manifest_schema=1 and manifest_generation is null) or
 (manifest_schema=2 and manifest_generation is not null and manifest_generation::text ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'))));
create function hosted_snapshot_generation_guard() returns trigger language plpgsql as $$
begin
 if OLD.manifest_schema is not null and (NEW.manifest_schema is distinct from OLD.manifest_schema or NEW.manifest_generation is distinct from OLD.manifest_generation) then
  raise exception using errcode='P0001',message='snapshot_generation_immutable';
 end if;
 return NEW;
end $$;
create trigger snapshot_generation_guard before update of manifest_schema,manifest_generation on snapshot_objects for each row execute function hosted_snapshot_generation_guard();
