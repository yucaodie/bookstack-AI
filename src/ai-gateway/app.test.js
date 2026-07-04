import test from 'node:test';
import assert from 'node:assert/strict';

import { createAiGatewayConfig } from './config.js';
import { createAiGatewayApp } from './app.js';
import { createAuditLogger } from './auditLogger.js';
import { createAuthContextResolver } from './authContextResolver.js';
import { createStorageRepositories } from '../storage/repositories.js';

test('createAiGatewayConfig 会生成默认配置', () => {
  const config = createAiGatewayConfig({ serviceToken: 'svc-token' });

  assert.equal(config.environment, 'development');
  assert.equal(config.retrieval.topK, 5);
  assert.equal(config.limits.queryPerMinute, 60);
  assert.equal(config.metrics.requests, 0);
});

test('AuthContextResolver 会拒绝无效 token', () => {
  const resolver = createAuthContextResolver({ serviceToken: 'svc-token' });

  assert.throws(() => resolver.resolve({ authorization: 'Bearer wrong' }, {}), {
    name: 'AuthError',
    code: 'invalid_service_token',
  });
});

test('AI Gateway health 路由返回健康信息和指标', async () => {
  const repositories = createStorageRepositories();
  repositories.knowledgeChunks.upsert({
    chunk_id: 'chunk-health',
    tenant_id: 'tenant-01',
    page_id: 1,
    path_text: '平台手册/健康',
    content_text: '健康检查内容。',
    content_hash: 'hash-health',
    chunk_index: 0,
    embedding_model: 'zh-default',
    language_code: 'zh-CN',
    embedding: [0.1],
    permission_scope_hash: 'perm-health',
    version_ts: '2026-07-03T00:00:00Z',
    is_active: true,
  });
  repositories.indexJobs.upsert({
    job_id: 'job-health',
    tenant_id: 'tenant-01',
    entity_type: 'attachment',
    entity_id: '1',
    event_type: 'attachment.indexed',
    status: 'failed',
    queued_at: '2026-07-03T00:00:00Z',
    processed_at: '2026-07-03T00:01:00Z',
    failure_reason: 'timeout',
  });
  const app = createAiGatewayApp({ serviceToken: 'svc-token', repositories });
  const response = await app.handle({ method: 'GET', path: '/internal/ai/health' });

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.metrics.requests, 0);
  assert.equal(response.body.observability.indexed_chunks, 1);
  assert.equal(response.body.observability.failed_index_jobs, 1);
  assert.equal(response.body.services.document_parse, 'ok');
});

test('AI Gateway query 路由会解析鉴权并记录审计', async () => {
  const loggerSink = [];
  const auditSink = [];
  const repositories = createStorageRepositories();
  repositories.knowledgeChunks.upsert({
    chunk_id: 'chunk-1',
    tenant_id: 'tenant-01',
    page_id: 101,
    book_id: 10,
    chapter_id: 1001,
    shelf_id: 1,
    path_text: '平台手册/认证',
    content_text: '配置单点登录需要设置回调地址和客户端密钥。',
    content_hash: 'hash-1',
    chunk_index: 0,
    embedding_model: 'zh-default',
    language_code: 'zh-CN',
    embedding: [0.1, 0.2],
    permission_scope_hash: 'perm-1',
    permission_scope: { pages: [101], books: [10] },
    version_ts: '2026-07-03T00:00:00Z',
    is_active: true,
  });
  const app = createAiGatewayApp({
    serviceToken: 'svc-token',
    loggerSink,
    auditSink,
    repositories,
  });

  const response = await app.handle({
    method: 'POST',
    path: '/internal/ai/query',
    headers: { authorization: 'Bearer svc-token' },
    body: {
      request_id: 'req-1',
      tenant_id: 'tenant-01',
      user_id: 'user-01',
      scope_mode: 'page',
      scopes: { pages: [101] },
      question: '如何配置单点登录？',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.request_id, 'req-1');
  assert.match(response.body.answer, /stub-answer/);
  assert.equal(response.body.citations.length, 1);
  assert.equal(auditSink.length, 1);
  assert.equal(auditSink[0].tenant_id, 'tenant-01');
  assert.deepEqual(auditSink[0].retrieved_chunk_ids, ['chunk-1']);
  assert.equal(app.config.metrics.requests, 1);
  assert.equal(loggerSink.some((entry) => entry.event === 'auth.resolved'), true);
});

test('AI Gateway query 路由会在证据不足时返回收缩提示', async () => {
  const app = createAiGatewayApp({
    serviceToken: 'svc-token',
    repositories: createStorageRepositories(),
  });

  const response = await app.handle({
    method: 'POST',
    path: '/internal/ai/query',
    headers: { authorization: 'Bearer svc-token' },
    body: {
      request_id: 'req-empty',
      tenant_id: 'tenant-01',
      user_id: 'user-01',
      scope_mode: 'page',
      scopes: { pages: [101] },
      question: '系统如何配置付款网关？',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.citations.length, 0);
  assert.match(response.body.answer, /证据不足/);
});

test('AI Gateway query 路由会返回 SSE 事件流', async () => {
  const repositories = createStorageRepositories();
  repositories.knowledgeChunks.upsert({
    chunk_id: 'chunk-stream',
    tenant_id: 'tenant-01',
    page_id: 101,
    book_id: 10,
    chapter_id: 1001,
    shelf_id: 1,
    path_text: '平台手册/认证',
    content_text: '配置单点登录需要设置回调地址。',
    content_hash: 'hash-stream',
    chunk_index: 0,
    embedding_model: 'zh-default',
    language_code: 'zh-CN',
    embedding: [0.1, 0.2],
    permission_scope_hash: 'perm-stream',
    permission_scope: { pages: [101], books: [10] },
    version_ts: '2026-07-03T00:00:00Z',
    is_active: true,
  });
  const app = createAiGatewayApp({ serviceToken: 'svc-token', repositories });

  const response = await app.handle({
    method: 'POST',
    path: '/internal/ai/query',
    headers: { authorization: 'Bearer svc-token' },
    body: {
      request_id: 'req-stream',
      tenant_id: 'tenant-01',
      user_id: 'user-01',
      scope_mode: 'page',
      scopes: { pages: [101] },
      question: '如何配置单点登录？',
      stream: true,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'text/event-stream');
  assert.match(response.body, /event: start/);
  assert.match(response.body, /event: delta/);
  assert.match(response.body, /event: citation/);
  assert.match(response.body, /event: done/);
});

test('AI Gateway 检索会先按租户与权限范围过滤 chunk', async () => {
  const repositories = createStorageRepositories();
  repositories.knowledgeChunks.upsert({
    chunk_id: 'chunk-visible',
    tenant_id: 'tenant-01',
    page_id: 101,
    book_id: 10,
    chapter_id: 1001,
    shelf_id: 1,
    path_text: '平台手册/认证',
    content_text: '配置单点登录需要设置回调地址。',
    content_hash: 'hash-visible',
    chunk_index: 0,
    embedding_model: 'zh-default',
    language_code: 'zh-CN',
    embedding: [0.1, 0.2],
    permission_scope_hash: 'perm-visible',
    permission_scope: { pages: [101], books: [10] },
    version_ts: '2026-07-03T00:00:00Z',
    is_active: true,
  });
  repositories.knowledgeChunks.upsert({
    chunk_id: 'chunk-hidden',
    tenant_id: 'tenant-02',
    page_id: 202,
    book_id: 20,
    chapter_id: 2001,
    shelf_id: 2,
    path_text: '其他租户/认证',
    content_text: '配置单点登录需要设置回调地址。',
    content_hash: 'hash-hidden',
    chunk_index: 0,
    embedding_model: 'zh-default',
    language_code: 'zh-CN',
    embedding: [0.1, 0.2],
    permission_scope_hash: 'perm-hidden',
    permission_scope: { pages: [202], books: [20] },
    version_ts: '2026-07-03T00:00:00Z',
    is_active: true,
  });
  const app = createAiGatewayApp({ serviceToken: 'svc-token', repositories });

  const response = await app.handle({
    method: 'POST',
    path: '/internal/ai/query',
    headers: { authorization: 'Bearer svc-token' },
    body: {
      request_id: 'req-filter',
      tenant_id: 'tenant-01',
      user_id: 'user-01',
      scope_mode: 'page',
      scopes: { pages: [101], books: [10] },
      question: '如何配置单点登录？',
    },
  });

  assert.deepEqual(response.body.citations.map((item) => item.chunk_id), ['chunk-visible']);
});

test('正确性属性 3：权限收缩后 chunk 在后续检索中不可见', async () => {
  const repositories = createStorageRepositories();
  const app = createAiGatewayApp({ serviceToken: 'svc-token', repositories });

  for (let index = 0; index < 3; index += 1) {
    repositories.knowledgeChunks.upsert({
      chunk_id: `chunk-shrink-${index}`,
      tenant_id: 'tenant-01',
      page_id: 100 + index,
      book_id: 10,
      chapter_id: 1000 + index,
      shelf_id: 1,
      path_text: `平台手册/认证/${index}`,
      content_text: `配置单点登录需要设置回调地址 ${index}`,
      content_hash: `hash-shrink-${index}`,
      chunk_index: 0,
      embedding_model: 'zh-default',
      language_code: 'zh-CN',
      embedding: [0.1, 0.2],
      permission_scope_hash: `perm-shrink-${index}`,
      permission_scope: { pages: [100 + index], books: [10] },
      version_ts: '2026-07-03T00:00:00Z',
      is_active: index !== 1,
    });
  }

  const response = await app.handle({
    method: 'POST',
    path: '/internal/ai/query',
    headers: { authorization: 'Bearer svc-token' },
    body: {
      tenant_id: 'tenant-01',
      user_id: 'user-01',
      scope_mode: 'workspace',
      scopes: { books: [10], pages: [100, 101, 102] },
      question: '如何配置单点登录？',
    },
  });

  assert.deepEqual(response.body.citations.map((item) => item.chunk_id).includes('chunk-shrink-1'), false);
});

test('正确性属性 5：自动生成的 request_id 在连续请求中保持唯一', async () => {
  const repositories = createStorageRepositories();
  repositories.knowledgeChunks.upsert({
    chunk_id: 'chunk-unique',
    tenant_id: 'tenant-01',
    page_id: 101,
    book_id: 10,
    chapter_id: 1001,
    shelf_id: 1,
    path_text: '平台手册/认证',
    content_text: '配置单点登录需要设置回调地址。',
    content_hash: 'hash-unique',
    chunk_index: 0,
    embedding_model: 'zh-default',
    language_code: 'zh-CN',
    embedding: [0.1, 0.2],
    permission_scope_hash: 'perm-unique',
    permission_scope: { pages: [101], books: [10] },
    version_ts: '2026-07-03T00:00:00Z',
    is_active: true,
  });
  const app = createAiGatewayApp({ serviceToken: 'svc-token', repositories });
  const seen = new Set();

  for (let index = 0; index < 5; index += 1) {
    const response = await app.handle({
      method: 'POST',
      path: '/internal/ai/query',
      headers: { authorization: 'Bearer svc-token' },
      body: {
        tenant_id: 'tenant-01',
        user_id: 'user-01',
        scope_mode: 'page',
        scopes: { pages: [101], books: [10] },
        question: '如何配置单点登录？',
      },
    });

    assert.equal(seen.has(response.body.request_id), false);
    seen.add(response.body.request_id);
  }

  assert.equal(seen.size, 5);
});

test('AI Gateway index event 路由会接受事件', async () => {
  const app = createAiGatewayApp({ serviceToken: 'svc-token' });
  const response = await app.handle({
    method: 'POST',
    path: '/internal/ai/index/events',
    headers: { authorization: 'Bearer svc-token' },
    body: {
      event_id: 'evt-1',
      event_type: 'page.updated',
      tenant_id: 'tenant-01',
    },
  });

  assert.equal(response.status, 202);
  assert.equal(response.body.accepted, true);
});

test('AI Gateway 对未知路由返回 404', async () => {
  const app = createAiGatewayApp({ serviceToken: 'svc-token' });
  const response = await app.handle({ method: 'GET', path: '/unknown' });

  assert.equal(response.status, 404);
  assert.equal(response.body.code, 'route_not_found');
  assert.equal(app.config.metrics.routeNotFound, 1);
});

test('AI Gateway query 路由对无效 token 返回 401', async () => {
  const app = createAiGatewayApp({ serviceToken: 'svc-token' });
  const response = await app.handle({
    method: 'POST',
    path: '/internal/ai/query',
    headers: { authorization: 'Bearer bad-token' },
    body: { question: 'x' },
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'invalid_service_token');
  assert.equal(app.config.metrics.authFailures, 1);
});

test('外部 RAG API 会校验 API Key 并复用问答链路', async () => {
  const auditSink = [];
  const repositories = createStorageRepositories();
  repositories.knowledgeChunks.upsert({
    chunk_id: 'chunk-api',
    tenant_id: 'tenant-01',
    page_id: 101,
    book_id: 10,
    chapter_id: 1001,
    shelf_id: 1,
    path_text: '平台手册/认证',
    content_text: '配置单点登录需要设置回调地址。',
    content_hash: 'hash-api',
    chunk_index: 0,
    embedding_model: 'zh-default',
    language_code: 'zh-CN',
    embedding: [0.1, 0.2],
    permission_scope_hash: 'perm-api',
    permission_scope: { books: [10], pages: [101] },
    version_ts: '2026-07-03T00:00:00Z',
    is_active: true,
  });
  repositories.apiClients.upsert({
    client_id: 'client-01',
    tenant_id: 'tenant-01',
    credential_ref: 'api-key:test-key',
    allowed_scope: { books: [10], pages: [101] },
    rate_limit_policy: { query_per_minute: 3 },
    status: 'active',
  });
  const app = createAiGatewayApp({ serviceToken: 'svc-token', repositories, auditSink });

  const response = await app.handle({
    method: 'POST',
    path: '/v1/rag/query',
    headers: { 'x-api-key': 'test-key' },
    body: {
      question: '如何配置单点登录？',
      scopes: { books: [10], pages: [101] },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.citations.length, 1);
  assert.equal(auditSink[0].channel, 'external');
  assert.equal(repositories.aiQueryLogs.getById(auditSink[0].request_id).user_id_or_client_id, 'client-01');
});

test('外部 RAG API 会拒绝无效 API Key', async () => {
  const app = createAiGatewayApp({ serviceToken: 'svc-token', repositories: createStorageRepositories() });

  const response = await app.handle({
    method: 'POST',
    path: '/v1/rag/query',
    headers: { 'x-api-key': 'bad-key' },
    body: { question: '如何配置单点登录？' },
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'invalid_api_key');
});

test('外部 RAG API 会按白名单范围收缩检索', async () => {
  const repositories = createStorageRepositories();
  repositories.knowledgeChunks.upsert({
    chunk_id: 'chunk-allow',
    tenant_id: 'tenant-01',
    page_id: 101,
    book_id: 10,
    chapter_id: 1001,
    shelf_id: 1,
    path_text: '平台手册/认证',
    content_text: '配置单点登录需要设置回调地址。',
    content_hash: 'hash-allow',
    chunk_index: 0,
    embedding_model: 'zh-default',
    language_code: 'zh-CN',
    embedding: [0.1, 0.2],
    permission_scope_hash: 'perm-allow',
    permission_scope: { books: [10], pages: [101] },
    version_ts: '2026-07-03T00:00:00Z',
    is_active: true,
  });
  repositories.knowledgeChunks.upsert({
    chunk_id: 'chunk-deny',
    tenant_id: 'tenant-01',
    page_id: 102,
    book_id: 11,
    chapter_id: 1002,
    shelf_id: 1,
    path_text: '平台手册/高级认证',
    content_text: '配置单点登录需要设置回调地址。',
    content_hash: 'hash-deny',
    chunk_index: 0,
    embedding_model: 'zh-default',
    language_code: 'zh-CN',
    embedding: [0.1, 0.2],
    permission_scope_hash: 'perm-deny',
    permission_scope: { books: [11], pages: [102] },
    version_ts: '2026-07-03T00:00:00Z',
    is_active: true,
  });
  repositories.apiClients.upsert({
    client_id: 'client-02',
    tenant_id: 'tenant-01',
    credential_ref: 'api-key:scope-key',
    allowed_scope: { books: [10], pages: [101] },
    rate_limit_policy: { query_per_minute: 3 },
    status: 'active',
  });
  const app = createAiGatewayApp({ serviceToken: 'svc-token', repositories });

  const response = await app.handle({
    method: 'POST',
    path: '/v1/rag/query',
    headers: { 'x-api-key': 'scope-key' },
    body: {
      question: '如何配置单点登录？',
      scopes: { books: [10, 11], pages: [101, 102] },
    },
  });

  assert.deepEqual(response.body.citations.map((item) => item.chunk_id), ['chunk-allow']);
});

test('外部 RAG API 会返回限流错误码', async () => {
  const repositories = createStorageRepositories();
  repositories.knowledgeChunks.upsert({
    chunk_id: 'chunk-limit',
    tenant_id: 'tenant-01',
    page_id: 101,
    book_id: 10,
    chapter_id: 1001,
    shelf_id: 1,
    path_text: '平台手册/认证',
    content_text: '配置单点登录需要设置回调地址。',
    content_hash: 'hash-limit',
    chunk_index: 0,
    embedding_model: 'zh-default',
    language_code: 'zh-CN',
    embedding: [0.1, 0.2],
    permission_scope_hash: 'perm-limit',
    permission_scope: { books: [10], pages: [101] },
    version_ts: '2026-07-03T00:00:00Z',
    is_active: true,
  });
  repositories.apiClients.upsert({
    client_id: 'client-03',
    tenant_id: 'tenant-01',
    credential_ref: 'api-key:limit-key',
    allowed_scope: { books: [10], pages: [101] },
    rate_limit_policy: { query_per_minute: 1 },
    status: 'active',
  });
  const app = createAiGatewayApp({ serviceToken: 'svc-token', repositories });

  const first = await app.handle({
    method: 'POST',
    path: '/v1/rag/query',
    headers: { 'x-api-key': 'limit-key' },
    body: { question: '如何配置单点登录？', scopes: { books: [10], pages: [101] } },
  });
  const second = await app.handle({
    method: 'POST',
    path: '/v1/rag/query',
    headers: { 'x-api-key': 'limit-key' },
    body: { question: '如何配置单点登录？', scopes: { books: [10], pages: [101] } },
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.equal(second.body.code, 'rate_limited');
});

test('外部 RAG API 支持 SSE 流式输出', async () => {
  const repositories = createStorageRepositories();
  repositories.knowledgeChunks.upsert({
    chunk_id: 'chunk-external-stream',
    tenant_id: 'tenant-01',
    page_id: 101,
    book_id: 10,
    chapter_id: 1001,
    shelf_id: 1,
    path_text: '平台手册/认证',
    content_text: '配置单点登录需要设置回调地址。',
    content_hash: 'hash-external-stream',
    chunk_index: 0,
    embedding_model: 'zh-default',
    language_code: 'zh-CN',
    embedding: [0.1, 0.2],
    permission_scope_hash: 'perm-external-stream',
    permission_scope: { books: [10], pages: [101] },
    version_ts: '2026-07-03T00:00:00Z',
    is_active: true,
  });
  repositories.apiClients.upsert({
    client_id: 'client-04',
    tenant_id: 'tenant-01',
    credential_ref: 'api-key:stream-key',
    allowed_scope: { books: [10], pages: [101] },
    rate_limit_policy: { query_per_minute: 3 },
    status: 'active',
  });
  const app = createAiGatewayApp({ serviceToken: 'svc-token', repositories });

  const response = await app.handle({
    method: 'POST',
    path: '/v1/rag/query',
    headers: { 'x-api-key': 'stream-key' },
    body: {
      question: '如何配置单点登录？',
      scopes: { books: [10], pages: [101] },
      stream: true,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'text/event-stream');
  assert.match(response.body, /event: start/);
  assert.match(response.body, /event: citation/);
  assert.match(response.body, /event: done/);
});

test('内部审计查询接口会按租户隔离并返回脱敏结果', async () => {
  const repositories = createStorageRepositories();
  const app = createAiGatewayApp({ serviceToken: 'svc-token', repositories });
  repositories.aiQueryLogs.upsert({
    request_id: 'req-audit-1',
    tenant_id: 'tenant-01',
    channel: 'internal',
    user_id_or_client_id: 'user-01',
    question_text: '联系 admin@example.com 获取配置',
    answer_summary: '请联系 admin@example.com 完成配置',
    model_name: 'zh-default',
    prompt_tokens: 10,
    completion_tokens: 5,
    latency_ms: 12,
    status: 'completed',
    created_at: '2026-07-04T00:00:00Z',
  });
  repositories.aiQueryLogs.upsert({
    request_id: 'req-audit-2',
    tenant_id: 'tenant-02',
    channel: 'internal',
    user_id_or_client_id: 'user-02',
    question_text: '其他租户内容',
    model_name: 'zh-default',
    prompt_tokens: 10,
    completion_tokens: 5,
    latency_ms: 12,
    status: 'completed',
    created_at: '2026-07-04T00:00:00Z',
  });

  const response = await app.handle({
    method: 'POST',
    path: '/internal/ai/audit/query',
    headers: { authorization: 'Bearer svc-token' },
    body: {
      tenant_id: 'tenant-01',
      limit: 10,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.entries.length, 1);
  assert.match(response.body.entries[0].question_text, /redacted-email/);
  assert.match(response.body.entries[0].answer_summary, /redacted-email/);
});

test('内部观测接口会返回健康快照和审计计数', async () => {
  const auditSink = [];
  const repositories = createStorageRepositories();
  const app = createAiGatewayApp({ serviceToken: 'svc-token', repositories, auditSink });
  auditSink.push({ request_id: 'req-observe', tenant_id: 'tenant-01' });

  const response = await app.handle({
    method: 'GET',
    path: '/internal/ai/observability',
    headers: { authorization: 'Bearer svc-token' },
    body: { tenant_id: 'tenant-01' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.audit_retained_records, 1);
  assert.equal(response.body.health.status, 'ok');
});

test('审计日志支持保留期清理', () => {
  const repositories = createStorageRepositories();
  const sink = [];
  const auditLogger = createAuditLogger({
    sink,
    repositories,
    retentionDays: 1,
    now: () => '2026-07-05T00:00:00Z',
  });

  auditLogger.record({
    request_id: 'req-old',
    tenant_id: 'tenant-01',
    channel: 'internal',
    user_id_or_client_id: 'user-01',
    question_text: '旧记录',
    answer_summary: '旧摘要',
    model_name: 'zh-default',
    prompt_tokens: 1,
    completion_tokens: 1,
    latency_ms: 1,
    status: 'completed',
    created_at: '2026-07-01T00:00:00Z',
  });
  auditLogger.record({
    request_id: 'req-new',
    tenant_id: 'tenant-01',
    channel: 'internal',
    user_id_or_client_id: 'user-01',
    question_text: '新记录',
    answer_summary: '新摘要',
    model_name: 'zh-default',
    prompt_tokens: 1,
    completion_tokens: 1,
    latency_ms: 1,
    status: 'completed',
    created_at: '2026-07-05T00:00:00Z',
  });

  const count = auditLogger.purgeExpired();
  assert.equal(count, 1);
  assert.equal(repositories.aiQueryLogs.getById('req-old'), null);
  assert.equal(repositories.aiQueryLogs.getById('req-new').request_id, 'req-new');
});
