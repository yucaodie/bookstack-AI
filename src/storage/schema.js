export const TABLES = Object.freeze({
  knowledgeChunk: 'knowledge_chunk',
  indexJob: 'index_job',
  aiQueryLog: 'ai_query_log',
  apiClient: 'api_client',
  embeddingProfile: 'embedding_profile',
});

export const EMBEDDING_DIMENSION = 1536;

export const CREATE_EXTENSION_SQL = `CREATE EXTENSION IF NOT EXISTS vector;`;

export const CREATE_TABLE_STATEMENTS = Object.freeze({
  embedding_profile: `
CREATE TABLE IF NOT EXISTS embedding_profile (
  profile_id TEXT PRIMARY KEY,
  language_code TEXT NOT NULL,
  embedding_provider TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  dimension INTEGER NOT NULL CHECK (dimension > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
  knowledge_chunk: `
CREATE TABLE IF NOT EXISTS knowledge_chunk (
  chunk_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  page_id BIGINT,
  attachment_id BIGINT,
  attachment_page_no INTEGER,
  book_id BIGINT,
  chapter_id BIGINT,
  shelf_id BIGINT,
  source_type TEXT NOT NULL DEFAULT 'page',
  path_text TEXT NOT NULL,
  content_text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding_model TEXT NOT NULL,
  language_code TEXT NOT NULL,
  embedding vector(${EMBEDDING_DIMENSION}) NOT NULL,
  permission_scope_hash TEXT NOT NULL,
  version_ts TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
  index_job: `
CREATE TABLE IF NOT EXISTS index_job (
  job_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  queued_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ
);`,
  ai_query_log: `
CREATE TABLE IF NOT EXISTS ai_query_log (
  request_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  user_id_or_client_id TEXT NOT NULL,
  question_text TEXT NOT NULL,
  retrieved_chunk_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  answer_summary TEXT,
  model_name TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
  api_client: `
CREATE TABLE IF NOT EXISTS api_client (
  client_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  credential_ref TEXT NOT NULL,
  allowed_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  rate_limit_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
});

export const INDEX_STATEMENTS = Object.freeze([
  `CREATE INDEX IF NOT EXISTS idx_knowledge_chunk_tenant_language_active ON knowledge_chunk (tenant_id, language_code, is_active);`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_chunk_page_version ON knowledge_chunk (page_id, version_ts DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_chunk_permission_scope ON knowledge_chunk (permission_scope_hash);`,
  `CREATE INDEX IF NOT EXISTS idx_index_job_tenant_status ON index_job (tenant_id, status, queued_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_ai_query_log_tenant_created_at ON ai_query_log (tenant_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_api_client_tenant_status ON api_client (tenant_id, status);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_embedding_profile_language_model_active ON embedding_profile (language_code, embedding_model, is_active);`,
]);

export function buildSchemaStatements() {
  return [
    CREATE_EXTENSION_SQL,
    CREATE_TABLE_STATEMENTS.embedding_profile,
    CREATE_TABLE_STATEMENTS.knowledge_chunk,
    CREATE_TABLE_STATEMENTS.index_job,
    CREATE_TABLE_STATEMENTS.ai_query_log,
    CREATE_TABLE_STATEMENTS.api_client,
    ...INDEX_STATEMENTS,
  ];
}
