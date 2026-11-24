create table discovery_review(
 tenant_id uuid not null references tenants(id) on delete cascade,
 user_id uuid not null,
 url_hash text not null check(url_hash ~ '^[a-f0-9]{64}$'),
 url text not null check(length(url)<=4096 and url_hash=encode(sha256(convert_to(url,'UTF8')),'hex')),
 state text not null check(state in ('seen','dismissed')),
 version uuid not null,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(tenant_id,user_id,url_hash)
);
create function hosted_discovery_review_guard() returns trigger language plpgsql as $$
begin
 perform hosted_workspace_active(NEW.tenant_id);perform hosted_account_active(NEW.user_id);
 if not exists(select 1 from memberships where tenant_id=NEW.tenant_id and user_id=NEW.user_id) then raise exception using errcode='P0001',message='not_found';end if;
 if TG_OP='INSERT' and (select count(*) from discovery_review where tenant_id=NEW.tenant_id and user_id=NEW.user_id)>=500 then raise exception using errcode='P0001',message='review_limit';end if;
 if TG_OP='UPDATE' then
  if (NEW.tenant_id,NEW.user_id,NEW.url_hash,NEW.url) is distinct from (OLD.tenant_id,OLD.user_id,OLD.url_hash,OLD.url) then raise exception using errcode='P0001',message='immutable_review';end if;
  NEW.updated_at:=clock_timestamp();
 end if;
 return NEW;
end $$;
create trigger discovery_review_guard before insert or update on discovery_review for each row execute function hosted_discovery_review_guard();
revoke all on discovery_review from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='career_web') then grant select,insert,delete on discovery_review to career_web;grant update(state,version) on discovery_review to career_web;end if;
end $$;
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('hosted_deletion_scope(uuid)'::regprocedure);
 if position('return scope;' in definition)=0 then raise exception 'deletion_scope_contract_changed';end if;
 definition:=replace(definition,'return scope;',
 'if (select count(*) from public.discovery_review where user_id=p_user)>500 then raise exception using errcode=''P0001'',message=''scope_review_required'';end if;
 scope:=scope||jsonb_build_object(''discoveryReview'',coalesce((select jsonb_agg(jsonb_build_object(''urlHash'',url_hash,''version'',version) order by url_hash) from public.discovery_review where user_id=p_user),''[]''::jsonb));
 return scope;');
 execute definition;
end $migration$;

-- Mirror review choices for old clients and invalidate stale saved-note forms.
create function hosted_review_saved_sync() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare item record; chosen text;
begin
 if TG_OP='DELETE' then item:=OLD;chosen:='new';else item:=NEW;chosen:=NEW.state;end if;
 if exists(select 1 from public.account_tombstones where user_id=item.user_id and active) or exists(select 1 from public.workspace_tombstones where tenant_id=item.tenant_id and active) then return null;end if;
 update public.saved_jobs set workflow=workflow||jsonb_build_object('state',chosen)
 where tenant_id=item.tenant_id and user_id=item.user_id and url_hash=item.url_hash and coalesce(workflow->>'state','new') is distinct from chosen;
 return null;
end $$;
create trigger review_saved_sync after insert or update or delete on discovery_review for each row execute function hosted_review_saved_sync();
revoke all on function hosted_review_saved_sync() from public;

-- Preserve existing active-account saved review choices when unifying states.
insert into discovery_review(tenant_id,user_id,url_hash,url,state,version)
 select s.tenant_id,s.user_id,s.url_hash,s.posting->>'url',s.workflow->>'state',gen_random_uuid() from saved_jobs s
 where s.workflow->>'state' in ('seen','dismissed')
 and not exists(select 1 from account_tombstones a where a.user_id=s.user_id and a.active)
 and not exists(select 1 from workspace_tombstones w where w.tenant_id=s.tenant_id and w.active);

do $migration$
declare definition text; marker text;
begin
 definition:=pg_get_functiondef('hosted_preview_deletion(uuid,text,uuid)'::regprocedure);
 marker:=$text$'savedSearches',jsonb_array_length(scope->'savedSearches')$text$;
 if position(marker in definition)=0 then raise exception 'deletion_preview_contract_changed';end if;
 execute replace(definition,marker,marker||$text$,'discoveryReview',jsonb_array_length(scope->'discoveryReview')$text$);
end $migration$;
