const known=new Set(['application_conflict','application_not_found','invalid_application_update','posting_archive_required','status_update_failed','application_limit','engine_failed','invalid_evaluation','report_not_created','tracker_not_merged','workspace_io_failed','pending_tracker_additions',
  'tailoring_failed','cv_facts_failed','invalid_cv_html','tailored_html_missing',
  'invalid_pdf','invalid_pdf_pages','pdf_not_indexed','pdf_not_marked_ready','evaluation_stale',
  'evaluation_not_in_tracker','browser_required','fact_config_required','timed_out','output_limit',
  'model_rate_limited','model_access_denied','model_request_rejected','model_response_truncated',
  'model_empty_response','model_cv_json_invalid','model_cv_schema_invalid','model_cv_identity_invalid','model_cv_fields_invalid']);
export function workerErrorCode(reply){return reply?.ok===false&&known.has(reply.error)?reply.error:'worker_failed';}
