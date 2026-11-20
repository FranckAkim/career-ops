create unique index workspace_versions_committed_job on workspace_versions(tenant_id,job_id) where job_id is not null;
