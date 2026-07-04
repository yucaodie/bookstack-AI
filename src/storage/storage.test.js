import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialMigration, listMigrations } from './migrations.js';
import { buildSchemaStatements, CREATE_TABLE_STATEMENTS, EMBEDDING_DIMENSION } from './schema.js';
import { createStorageRepositories } from './repositories.js';
import { validateKnowledgeChunk, validateApiClient } from './validators.js';

test('schema 构建包含 pgvector 扩展和核心表', () => {
  const statements = buildSchemaStatements();

  assert.equal(statements[0], 'CREATE EXTENSION IF NOT EXISTS vector;');
  assert.match(CREATE_TABLE_STATEMENTS.knowledge_chunk, new RegExp(`vector\\(${EMBEDDING_DIMENSION}\\)`));
  assert.equal(statements.some((statement) => statement.includes('CREATE TABLE IF NOT EXISTS api_client')), true);
});

test('迁移列表包含初始迁移和 SQL 语句', () => {
  const migration = createInitialMigration();
  const migrations = listMigrations();

  assert.equal(migration.id, '20260703_001_initial_ai_storage');
  assert.equal(migration.statements.length > 5, true);
  assert.equal(migrations.length, 1);
});

test('knowledge_chunk 校验会拒绝缺失必填字段', () => {
  assert.throws(() => validateKnowledgeChunk({ tenant_id: 'tenant-01' }), {
    message: /chunk_id must be a non-empty string/,
  });
});

test('api_client 校验会补齐默认 scope 与策略', () => {
  const record = validateApiClient({
    client_id: 'client-01',
    tenant_id: 'tenant-01',
    credential_ref: 'vault://client-01',
    status: 'active',
  });

  assert.deepEqual(record.allowed_scope, {});
  assert.deepEqual(record.rate_limit_policy, {});
});

test('storage repositories 支持 upsert 和按条件读取', () => {
  const repositories = createStorageRepositories();

  repositories.embeddingProfiles.upsert({
    profile_id: 'zh-default',
    language_code: 'zh-CN',
    embedding_provider: 'managed',
    embedding_model: 'zh-embed-v1',
    dimension: 1536,
  });
  repositories.knowledgeChunks.upsert({
    chunk_id: 'chunk-01',
    tenant_id: 'tenant-01',
    page_id: 101,
    path_text: '平台手册/认证/认证配置',
    content_text: '系统支持 OIDC。',
    content_hash: 'hash-01',
    chunk_index: 0,
    embedding_model: 'zh-embed-v1',
    language_code: 'zh-CN',
    embedding: [0.1, 0.2, 0.3],
    permission_scope_hash: 'perm-01',
    version_ts: '2026-07-03T00:00:00Z',
  });
  repositories.indexJobs.upsert({
    job_id: 'job-01',
    tenant_id: 'tenant-01',
    entity_type: 'page',
    entity_id: '101',
    event_type: 'page.updated',
    status: 'queued',
    queued_at: '2026-07-03T00:00:00Z',
  });
  repositories.aiQueryLogs.upsert({
    request_id: 'req-01',
    tenant_id: 'tenant-01',
    channel: 'internal',
    user_id_or_client_id: 'user-01',
    question_text: '如何接入单点登录？',
    model_name: 'stub-model',
    status: 'completed',
  });
  repositories.apiClients.upsert({
    client_id: 'client-01',
    tenant_id: 'tenant-01',
    credential_ref: 'vault://client-01',
    status: 'active',
    allowed_scope: { books: [10] },
  });

  assert.equal(repositories.embeddingProfiles.listActiveByLanguage('zh-CN').length, 1);
  assert.equal(repositories.knowledgeChunks.listActiveByTenantAndLanguage('tenant-01', 'zh-CN').length, 1);
  assert.equal(repositories.indexJobs.listByTenant('tenant-01').length, 1);
  assert.equal(repositories.aiQueryLogs.getById('req-01').question_text, '如何接入单点登录？');
  assert.deepEqual(repositories.apiClients.listActiveByTenant('tenant-01')[0].allowed_scope, { books: [10] });
});
