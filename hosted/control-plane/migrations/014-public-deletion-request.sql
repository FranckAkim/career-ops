-- Runtime may review/request a recent authenticated user's account block, never
-- read or mutate purge/fence ledgers. Physical removal remains operator-only.
create function hosted_deletion_scope(p_user uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare t uuid; scope jsonb; n integer;
begin
 select count(*) into n from public.memberships where user_id=p_user;
 if n>1 or exists(select 1 from public.memberships where user_id=p_user and role<>'owner') then raise exception using errcode='P0001',message='shared_workspace_review_required';end if;
 select tenant_id into t from public.memberships where user_id=p_user;
 if t is not null and (not exists(select 1 from public.personal_workspaces where user_id=p_user and tenant_id=t) or (select count(*) from public.memberships where tenant_id=t)<>1) then raise exception using errcode='P0001',message='shared_workspace_review_required';end if;
 if (select count(*) from public.profile_drafts where user_id=p_user)>1000 or (select count(*) from public.jobs where tenant_id=t)>10000 or (select count(*) from public.snapshot_captures where user_id=p_user)>20000 then raise exception using errcode='P0001',message='scope_review_required';end if;
 select jsonb_build_object('schema',1,'userId',p_user,'tenantId',t,
 'tenant',(select jsonb_build_object('id',id,'generation',generation::text,'snapshot',snapshot,'recoveryRequired',recovery_required) from public.tenants where id=t),
 'drafts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'reviewHash',review_hash,'confirmedAt',confirmed_at) order by id) from public.profile_drafts where user_id=p_user),'[]'::jsonb),
 'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'status',status,'fence',fence::text) order by id) from public.jobs where tenant_id=t),'[]'::jsonb),
 'captures',coalesce((select jsonb_agg(jsonb_build_object('id',id,'snapshot',snapshot_id,'state',state) order by id) from public.snapshot_captures where user_id=p_user),'[]'::jsonb)) into scope;
 return scope;
end $$;
revoke all on function hosted_deletion_scope(uuid) from public;
create function hosted_preview_deletion(p_user uuid,p_session text,p_tenant uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare scope jsonb;
begin
 if not exists(select 1 from public.auth_sessions where id::text=p_session and "userId"::text=p_user::text and "createdAt">=clock_timestamp()-interval '10 minutes' and "expiresAt">clock_timestamp()) then raise exception using errcode='P0001',message='reauthentication_required';end if;
 scope:=public.hosted_deletion_scope(p_user);
 if scope->>'tenantId' is distinct from p_tenant::text then raise exception using errcode='P0001',message='not_found';end if;
 return jsonb_build_object('scopeHash',encode(sha256(convert_to(scope::text,'UTF8')),'hex'),'tenantId',p_tenant,'counts',jsonb_build_object('profiles',jsonb_array_length(scope->'drafts'),'jobs',jsonb_array_length(scope->'jobs'),'captures',jsonb_array_length(scope->'captures')),'physicalDeletionAvailable',false);
end $$;
revoke all on function hosted_preview_deletion(uuid,text,uuid) from public;
create function hosted_request_deletion(p_user uuid,p_session text,p_tenant uuid,p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare scope jsonb; request_id uuid; prior public.account_deletion_requests%rowtype; reviewed jsonb;
begin
 perform 1 from public.tenants where id=p_tenant for update;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,847292));
 reviewed:=public.hosted_preview_deletion(p_user,p_session,p_tenant);
 if reviewed->>'scopeHash' is distinct from p_hash then raise exception using errcode='P0001',message='review_conflict';end if;
 select * into prior from public.account_deletion_requests where user_id=p_user and state in ('blocked_pending_review','fencing','purging') for update;
 if found then raise exception using errcode='P0001',message='account_deleting';end if;
 request_id:=gen_random_uuid();
 insert into public.account_deletion_requests(id,user_id,tenant_id,scope_hash,session_fingerprint) values(request_id,p_user,p_tenant,p_hash,encode(sha256(convert_to(p_session,'UTF8')),'hex'));
 insert into public.account_tombstones(user_id,request_id,active) values(p_user,request_id,true) on conflict(user_id) do update set request_id=excluded.request_id,active=true;
 if p_tenant is not null then insert into public.workspace_tombstones(tenant_id,request_id,active) values(p_tenant,request_id,true) on conflict(tenant_id) do update set request_id=excluded.request_id,active=true;end if;
 update public.jobs set status=case when status='queued' then 'cancelled' else 'cancel_requested' end,finished_at=case when status='queued' then clock_timestamp() else finished_at end where tenant_id=p_tenant and status in ('queued','running');
 delete from public.auth_sessions where "userId"::text=p_user::text;
 return jsonb_build_object('requestId',request_id,'state','blocked_pending_review','deleted',false,'sessionsRevoked',true);
end $$;
revoke all on function hosted_request_deletion(uuid,text,uuid,text) from public;
grant execute on function hosted_preview_deletion(uuid,text,uuid),hosted_request_deletion(uuid,text,uuid,text) to career_web;
