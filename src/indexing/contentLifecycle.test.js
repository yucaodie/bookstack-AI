import test from 'node:test';
import assert from 'node:assert/strict';

import { createStorageRepositories } from '../storage/repositories.js';
import { createContentLifecycleManager } from './contentLifecycle.js';

function seedChunk(repositories, overrides = {}) {
  repositories.knowledgeChunks.upsert({
    chunk_id: overrides.chunk_id ?? 'chunk-default',
    tenant_id: overrides.tenant_id ?? 'tenant-01',
    page_id: overrides.page_id ?? 101,
    attachment_id: overrides.attachment_id ?? null,
    attachment_page_no: overrides.attachment_page_no ?? null,
    book_id: overrides.book_id ?? 10,
    chapter_id: overrides.chapter_id ?? 1001,
    shelf_id: overrides.shelf_id ?? 1,
    source_type: overrides.source_type ?? 'page',
    path_text: overrides.path_text ?? '平台手册/认证',
    content_text: overrides.content_text ?? '配置单点登录需要设置回调地址。',
    content_hash: overrides.content_hash ?? `${overrides.chunk_id ?? 'chunk-default'}-hash`,
    chunk_index: overrides.chunk_index ?? 0,
    embedding_model: 'zh-default',
    language_code: 'zh-CN',
    embedding: [0.1, 0.2],
    permission_scope_hash: overrides.permission_scope_hash ?? 'perm-default',
    permission_scope: overrides.permission_scope ?? { books: [10], pages: [101] },
    version_ts: overrides.version_ts ?? '2026-07-03T00:00:00Z',
    is_active: overrides.is_active ?? true,
  });
}

test('页面删除会使对应 chunk 失活', () => {
  const repositories = createStorageRepositories();
  seedChunk(repositories, { chunk_id: 'chunk-page-1', page_id: 101 });
  seedChunk(repositories, { chunk_id: 'chunk-page-2', page_id: 102 });
  const manager = createContentLifecycleManager({ repositories });

  const count = manager.deactivatePage({ pageId: 101 });

  assert.equal(count, 1);
  assert.equal(repositories.knowledgeChunks.getById('chunk-page-1').is_active, false);
  assert.equal(repositories.knowledgeChunks.getById('chunk-page-2').is_active, true);
});

test('附件删除会使对应附件 chunk 失活', () => {
  const repositories = createStorageRepositories();
  seedChunk(repositories, { chunk_id: 'chunk-att-1', source_type: 'attachment', attachment_id: 9001, attachment_page_no: 1, page_id: 101 });
  seedChunk(repositories, { chunk_id: 'chunk-att-2', source_type: 'attachment', attachment_id: 9002, attachment_page_no: 1, page_id: 101 });
  const manager = createContentLifecycleManager({ repositories });

  const count = manager.deactivateAttachment({ attachmentId: 9001 });

  assert.equal(count, 1);
  assert.equal(repositories.knowledgeChunks.getById('chunk-att-1').is_active, false);
  assert.equal(repositories.knowledgeChunks.getById('chunk-att-2').is_active, true);
});

test('权限收缩后不在允许范围内的 chunk 不可见', () => {
  const repositories = createStorageRepositories();
  seedChunk(repositories, { chunk_id: 'chunk-keep', page_id: 101, book_id: 10, permission_scope: { books: [10], pages: [101] } });
  seedChunk(repositories, { chunk_id: 'chunk-drop', page_id: 102, book_id: 11, permission_scope: { books: [11], pages: [102] } });
  const manager = createContentLifecycleManager({ repositories });

  const count = manager.shrinkPermissionScope({ tenantId: 'tenant-01', allowedPages: [101], allowedBooks: [10] });

  assert.equal(count, 1);
  assert.equal(repositories.knowledgeChunks.getById('chunk-keep').is_active, true);
  assert.equal(repositories.knowledgeChunks.getById('chunk-drop').is_active, false);
});

test('租户级清理会删除派生索引和相关记录', () => {
  const repositories = createStorageRepositories();
  seedChunk(repositories, { chunk_id: 'chunk-tenant-1', tenant_id: 'tenant-01' });
  seedChunk(repositories, { chunk_id: 'chunk-tenant-2', tenant_id: 'tenant-02' });
  repositories.indexJobs.upsert({
    job_id: 'job-tenant-1',
    tenant_id: 'tenant-01',
    entity_type: 'page',
    entity_id: '101',
    event_type: 'page.updated',
    status: 'processed',
    queued_at: '2026-07-03T00:00:00Z',
  });
  repositories.aiQueryLogs.upsert({
    request_id: 'req-tenant-1',
    tenant_id: 'tenant-01',
    channel: 'internal',
    user_id_or_client_id: 'user-01',
    question_text: 'tenant 1',
    model_name: 'zh-default',
    status: 'completed',
  });
  repositories.apiClients.upsert({
    client_id: 'client-tenant-1',
    tenant_id: 'tenant-01',
    credential_ref: 'api-key:tenant-1',
    status: 'active',
  });
  const manager = createContentLifecycleManager({ repositories });

  const result = manager.purgeTenant({ tenantId: 'tenant-01' });

  assert.equal(result.removed_chunks, 1);
  assert.equal(result.removed_jobs, 1);
  assert.equal(result.removed_logs, 1);
  assert.equal(result.removed_clients, 1);
  assert.equal(repositories.knowledgeChunks.getById('chunk-tenant-1'), null);
  assert.equal(repositories.knowledgeChunks.getById('chunk-tenant-2').tenant_id, 'tenant-02');
});

test('旧版本失活 chunk 支持清理与重建计划生成', () => {
  const repositories = createStorageRepositories();
  seedChunk(repositories, { chunk_id: 'chunk-active-page', tenant_id: 'tenant-01', page_id: 101, is_active: true });
  seedChunk(repositories, { chunk_id: 'chunk-inactive-page', tenant_id: 'tenant-01', page_id: 102, is_active: false });
  seedChunk(repositories, { chunk_id: 'chunk-active-attachment', tenant_id: 'tenant-01', source_type: 'attachment', attachment_id: 9001, attachment_page_no: 1, page_id: 101, is_active: true });
  const manager = createContentLifecycleManager({ repositories });

  const removed = manager.purgeInactiveChunks({ tenantId: 'tenant-01' });
  const plan = manager.buildReindexPlan({ tenantId: 'tenant-01' });

  assert.equal(removed, 1);
  assert.equal(repositories.knowledgeChunks.getById('chunk-inactive-page'), null);
  assert.deepEqual(plan.page_ids, [101]);
  assert.deepEqual(plan.attachment_ids, [9001]);
});

test('正确性属性：租户级清理后该租户活动 chunk 数量归零', () => {
  const repositories = createStorageRepositories();
  for (let index = 0; index < 4; index += 1) {
    seedChunk(repositories, {
      chunk_id: `chunk-prop-${index}`,
      tenant_id: 'tenant-prop',
      page_id: 200 + index,
      book_id: 20,
      permission_scope: { books: [20], pages: [200 + index] },
    });
  }
  const manager = createContentLifecycleManager({ repositories });

  manager.purgeTenant({ tenantId: 'tenant-prop' });

  assert.equal(repositories.knowledgeChunks.listActiveByTenantAndLanguage('tenant-prop', 'zh-CN').length, 0);
});
