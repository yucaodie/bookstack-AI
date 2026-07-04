function assertString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string.`);
  }
}

function assertInteger(value, field) {
  if (!Number.isInteger(value)) {
    throw new Error(`${field} must be an integer.`);
  }
}

function assertIsoTimestamp(value, field) {
  assertString(value, field);
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a valid ISO timestamp.`);
  }
}

export function validateKnowledgeChunk(record) {
  assertString(record.chunk_id, 'chunk_id');
  assertString(record.tenant_id, 'tenant_id');
  assertString(record.path_text, 'path_text');
  assertString(record.content_text, 'content_text');
  assertString(record.content_hash, 'content_hash');
  assertString(record.embedding_model, 'embedding_model');
  assertString(record.language_code, 'language_code');
  assertString(record.permission_scope_hash, 'permission_scope_hash');
  assertInteger(record.chunk_index, 'chunk_index');
  assertIsoTimestamp(record.version_ts, 'version_ts');
  if (record.permission_scope && typeof record.permission_scope !== 'object') {
    throw new Error('permission_scope must be an object when provided.');
  }
  if (record.attachment_page_no !== undefined && record.attachment_page_no !== null) {
    assertInteger(record.attachment_page_no, 'attachment_page_no');
  }
  if (record.source_type !== undefined && typeof record.source_type !== 'string') {
    throw new Error('source_type must be a string when provided.');
  }
  if (!Array.isArray(record.embedding) || record.embedding.length === 0) {
    throw new Error('embedding must be a non-empty number array.');
  }
  return {
    ...record,
    is_active: record.is_active ?? true,
    permission_scope: record.permission_scope ?? {},
    attachment_id: record.attachment_id ?? null,
    attachment_page_no: record.attachment_page_no ?? null,
    source_type: record.source_type ?? 'page',
  };
}

export function validateIndexJob(record) {
  assertString(record.job_id, 'job_id');
  assertString(record.tenant_id, 'tenant_id');
  assertString(record.entity_type, 'entity_type');
  assertString(record.entity_id, 'entity_id');
  assertString(record.event_type, 'event_type');
  assertString(record.status, 'status');
  assertInteger(record.attempt_count ?? 0, 'attempt_count');
  assertIsoTimestamp(record.queued_at, 'queued_at');
  if (record.processed_at) {
    assertIsoTimestamp(record.processed_at, 'processed_at');
  }
  return { ...record, attempt_count: record.attempt_count ?? 0 };
}

export function validateAiQueryLog(record) {
  assertString(record.request_id, 'request_id');
  assertString(record.tenant_id, 'tenant_id');
  assertString(record.channel, 'channel');
  assertString(record.user_id_or_client_id, 'user_id_or_client_id');
  assertString(record.question_text, 'question_text');
  assertString(record.model_name, 'model_name');
  assertString(record.status, 'status');
  assertInteger(record.prompt_tokens ?? 0, 'prompt_tokens');
  assertInteger(record.completion_tokens ?? 0, 'completion_tokens');
  assertInteger(record.latency_ms ?? 0, 'latency_ms');
  return {
    ...record,
    retrieved_chunk_ids: record.retrieved_chunk_ids ?? [],
    prompt_tokens: record.prompt_tokens ?? 0,
    completion_tokens: record.completion_tokens ?? 0,
    latency_ms: record.latency_ms ?? 0,
  };
}

export function validateApiClient(record) {
  assertString(record.client_id, 'client_id');
  assertString(record.tenant_id, 'tenant_id');
  assertString(record.credential_ref, 'credential_ref');
  assertString(record.status, 'status');
  return {
    ...record,
    allowed_scope: record.allowed_scope ?? {},
    rate_limit_policy: record.rate_limit_policy ?? {},
  };
}

export function validateEmbeddingProfile(record) {
  assertString(record.profile_id, 'profile_id');
  assertString(record.language_code, 'language_code');
  assertString(record.embedding_provider, 'embedding_provider');
  assertString(record.embedding_model, 'embedding_model');
  assertInteger(record.dimension, 'dimension');
  return { ...record, is_active: record.is_active ?? true };
}
