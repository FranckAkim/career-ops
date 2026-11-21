alter table account_request_resolutions add column evidence_kind text not null default 'execution_terminated'
 check(evidence_kind in ('execution_terminated','resource_work_complete'));

create or replace function hosted_request_activity_guard() returns trigger language plpgsql as $$
begin
 if TG_OP='INSERT' then
  perform hosted_account_active(NEW.user_id);
  if NEW.state<>'active' then raise exception 'invalid_request_activity';end if;
 else
  if NEW.id<>OLD.id or NEW.user_id<>OLD.user_id or NEW.started_at<>OLD.started_at
    or NEW.deployment_id is distinct from OLD.deployment_id
    or NEW.instance_id is distinct from OLD.instance_id
    or OLD.state<>'active' or NEW.state not in ('settled','terminated') then
   raise exception 'invalid_request_activity';
  end if;
  if NEW.state='terminated' then
   if not exists(select 1 from account_request_resolutions r
     join account_tombstones t on t.user_id=r.user_id and t.request_id=r.request_id and t.active
     where r.activity_id=NEW.id and r.user_id=NEW.user_id
       and r.deployment_id=NEW.deployment_id and r.instance_id=NEW.instance_id
       and r.evidence_kind='execution_terminated') then
    raise exception 'termination_evidence_required';
   end if;
  end if;
 end if;
 return NEW;
end $$;
