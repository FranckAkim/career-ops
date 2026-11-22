-- Bound saved-role matching to the caller's evaluation URLs without indexing
-- potentially long raw URLs or copying candidate/report content.
create index jobs_saved_match on jobs(tenant_id,requested_by,
 (md5(payload->>'postingUrl')),created_at desc,id desc)
 where payload->>'operation'='evaluate';

-- The hash is only a lookup accelerator. Matching still checks exact URL and source text.
