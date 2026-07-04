import test from 'node:test';
import assert from 'node:assert/strict';

import { createStorageRepositories } from '../storage/repositories.js';
import { chunkNormalizedText } from './chunker.js';
import { createDocumentParseClient } from './documentParseClient.js';
import { createManagedChineseEmbeddingProvider } from './embeddingProvider.js';
import { createIndexingPipeline } from './indexingPipeline.js';
import { normalizeBookStackContent } from './normalizer.js';

test('HTML 标准化会保留路径和标题锚点', () => {
  const normalized = normalizeBookStackContent({
    format: 'html',
    path: ['平台手册', '认证'],
    content: '<h1>认证配置</h1><p>系统支持 OIDC。</p><h2>接入步骤</h2><p>配置回调地址。</p>',
  });

  assert.equal(normalized.path_text, '平台手册/认证');
  assert.deepEqual(normalized.headings.map((item) => item.anchor), ['认证配置', '接入步骤']);
  assert.match(normalized.normalized_text, /系统支持 OIDC/);
});

test('Markdown 标准化会去除语法并保留标题层次', () => {
  const normalized = normalizeBookStackContent({
    format: 'markdown',
    path: ['平台手册'],
    content: '# 认证配置\n\n- 系统支持 `OIDC`\n\n## 接入步骤\n[查看文档](https://example.com)',
  });

  assert.equal(normalized.headings.length, 2);
  assert.match(normalized.normalized_text, /系统支持 OIDC/);
  assert.doesNotMatch(normalized.normalized_text, /https:\/\//);
});

test('中文切片会生成稳定 hash 且单块长度受限', () => {
  const chunks = chunkNormalizedText({
    normalizedText: '第一段说明如何接入单点登录。第二段说明如何配置回调地址。第三段说明如何验证权限范围。',
    pathText: '平台手册/认证',
    maxChunkLength: 22,
    overlap: 6,
  });

  assert.equal(chunks.length >= 2, true);
  assert.equal(chunks.every((chunk) => chunk.content_hash.length === 64), true);
  assert.equal(chunks.every((chunk) => chunk.content_text.length <= 30), true);
});

test('托管中文 embedding provider 会返回固定维度向量', async () => {
  const provider = createManagedChineseEmbeddingProvider({ dimension: 8 });
  const vectors = await provider.embed(['系统支持 OIDC', '配置回调地址']);

  assert.equal(vectors.length, 2);
  assert.equal(vectors[0].length, 8);
  assert.deepEqual(vectors[0], await provider.embed(['系统支持 OIDC']).then((items) => items[0]));
});

test('索引流水线会写入 chunk、embedding profile，并失活旧版本', async () => {
  const repositories = createStorageRepositories();
  const provider = createManagedChineseEmbeddingProvider({ dimension: 8, modelName: 'zh-demo' });
  const pipeline = createIndexingPipeline({
    repositories,
    embeddingProvider: provider,
  });

  const first = await pipeline.indexPage({
    tenant_id: 'tenant-01',
    page_id: 101,
    book_id: 10,
    chapter_id: 1001,
    shelf_id: 1,
    path: ['平台手册', '认证', '认证配置'],
    format: 'html',
    content: '<h1>认证配置</h1><p>系统支持 OIDC。配置回调地址。</p>',
    permission_scope: { books: [10], pages: [101] },
    version_ts: '2026-07-03T00:00:00Z',
  });

  const second = await pipeline.indexPage({
    tenant_id: 'tenant-01',
    page_id: 101,
    book_id: 10,
    chapter_id: 1001,
    shelf_id: 1,
    path: ['平台手册', '认证', '认证配置'],
    format: 'markdown',
    content: '# 认证配置\n\n系统支持 OIDC。\n\n增加权限校验说明。',
    permission_scope: { books: [10], pages: [101] },
    version_ts: '2026-07-04T00:00:00Z',
  });

  const active = repositories.knowledgeChunks.listActiveByTenantAndLanguage('tenant-01', 'zh-CN');
  const pageRecords = repositories.knowledgeChunks.listByPage(101);
  const oldVersionRecords = pageRecords.filter((record) => record.version_ts === '2026-07-03T00:00:00Z');

  assert.equal(first.length >= 1, true);
  assert.equal(second.length >= 1, true);
  assert.equal(active.every((record) => record.version_ts === '2026-07-04T00:00:00Z'), true);
  assert.equal(oldVersionRecords.every((record) => record.is_active === false), true);
  assert.equal(repositories.embeddingProfiles.listActiveByLanguage('zh-CN')[0].embedding_model, 'zh-demo');
});

test('正确性属性 1：任意活动 chunk 都先具有租户、权限和语言过滤字段', async () => {
  const repositories = createStorageRepositories();
  const provider = createManagedChineseEmbeddingProvider({ dimension: 8, modelName: 'zh-prop' });
  const pipeline = createIndexingPipeline({ repositories, embeddingProvider: provider });

  for (let index = 0; index < 5; index += 1) {
    await pipeline.indexPage({
      tenant_id: `tenant-${index}`,
      page_id: 200 + index,
      book_id: 20,
      chapter_id: 2000,
      shelf_id: 2,
      path: ['手册', '认证'],
      format: 'markdown',
      content: `# 标题 ${index}\n\n系统支持 OIDC。权限说明 ${index}。`,
      permission_scope: { books: [20], pages: [200 + index] },
      version_ts: `2026-07-0${index + 1}T00:00:00Z`,
    });
  }

  const active = repositories.knowledgeChunks.listAll().filter((record) => record.is_active === true);
  assert.equal(active.every((record) => typeof record.tenant_id === 'string' && record.tenant_id.length > 0), true);
  assert.equal(active.every((record) => typeof record.permission_scope_hash === 'string' && record.permission_scope_hash.length === 64), true);
  assert.equal(active.every((record) => record.language_code === 'zh-CN'), true);
});

test('正确性属性 2：活动 chunk 的引用内容都来自当前存储中的有效 chunk', async () => {
  const repositories = createStorageRepositories();
  const provider = createManagedChineseEmbeddingProvider({ dimension: 8, modelName: 'zh-citation' });
  const pipeline = createIndexingPipeline({ repositories, embeddingProvider: provider });

  await pipeline.indexPage({
    tenant_id: 'tenant-citation',
    page_id: 301,
    book_id: 31,
    chapter_id: 3001,
    shelf_id: 3,
    path: ['平台手册', '问答'],
    format: 'html',
    content: '<h1>问答</h1><p>系统支持基于企业知识生成回答。</p><p>回答必须引用有效 chunk。</p>',
    permission_scope: { books: [31], pages: [301] },
    version_ts: '2026-07-05T00:00:00Z',
  });

  const active = repositories.knowledgeChunks.listActiveByTenantAndLanguage('tenant-citation', 'zh-CN');
  const citations = active.map((record) => record.chunk_id);

  assert.equal(citations.every((chunkId) => repositories.knowledgeChunks.getById(chunkId)?.is_active === true), true);
});

test('PDF 附件索引会保留 attachment_id 与 page_no 定位信息', async () => {
  const repositories = createStorageRepositories();
  const provider = createManagedChineseEmbeddingProvider({ dimension: 8, modelName: 'zh-pdf' });
  const documentParseClient = createDocumentParseClient({
    parsePdfDocument: async () => ({
      pages: [
        { page_no: 1, text: '第一页介绍系统架构。' },
        { page_no: 2, text: '第二页介绍权限范围与引用定位。' },
      ],
    }),
  });
  const pipeline = createIndexingPipeline({ repositories, embeddingProvider: provider });

  const result = await pipeline.indexAttachment({
    job_id: 'job-attachment-01',
    tenant_id: 'tenant-attachment',
    attachment_id: 9001,
    page_id: 101,
    book_id: 10,
    chapter_id: 1001,
    shelf_id: 1,
    path: ['平台手册', '认证附件'],
    file_name: 'oidc-guide.pdf',
    file_size_bytes: 1024,
    source_url: 'https://example.com/oidc-guide.pdf',
    permission_scope: { books: [10], pages: [101] },
    version_ts: '2026-07-06T00:00:00Z',
    documentParseClient,
  });

  const attachmentRecords = repositories.knowledgeChunks.listByAttachment(9001);
  assert.equal(result.page_count, 2);
  assert.equal(attachmentRecords.every((record) => record.source_type === 'attachment'), true);
  assert.deepEqual([...new Set(attachmentRecords.map((record) => record.attachment_page_no))], [1, 2]);
  assert.equal(repositories.indexJobs.getById('job-attachment-01').status, 'processed');
});

test('PDF 解析超时会回写失败状态', async () => {
  const repositories = createStorageRepositories();
  const provider = createManagedChineseEmbeddingProvider({ dimension: 8, modelName: 'zh-pdf-timeout' });
  const documentParseClient = createDocumentParseClient({
    timeoutMs: 10,
    parsePdfDocument: () => new Promise((resolve) => {
      setTimeout(() => resolve({ pages: [{ page_no: 1, text: '延迟页面。' }] }), 30);
    }),
  });
  const pipeline = createIndexingPipeline({ repositories, embeddingProvider: provider });

  await assert.rejects(() => pipeline.indexAttachment({
    job_id: 'job-attachment-timeout',
    tenant_id: 'tenant-attachment',
    attachment_id: 9002,
    page_id: 101,
    book_id: 10,
    chapter_id: 1001,
    shelf_id: 1,
    path: ['平台手册', '认证附件'],
    file_name: 'slow.pdf',
    file_size_bytes: 1024,
    source_url: 'https://example.com/slow.pdf',
    permission_scope: { books: [10], pages: [101] },
    documentParseClient,
  }), /timed out/);

  const job = repositories.indexJobs.getById('job-attachment-timeout');
  assert.equal(job.status, 'failed');
  assert.match(job.failure_reason, /timed out/);
});

test('PDF 页数限制会触发失败回写', async () => {
  const repositories = createStorageRepositories();
  const provider = createManagedChineseEmbeddingProvider({ dimension: 8, modelName: 'zh-pdf-limit' });
  const documentParseClient = createDocumentParseClient({
    maxPages: 1,
    parsePdfDocument: async () => ({
      pages: [
        { page_no: 1, text: '第一页。' },
        { page_no: 2, text: '第二页。' },
      ],
    }),
  });
  const pipeline = createIndexingPipeline({ repositories, embeddingProvider: provider });

  await assert.rejects(() => pipeline.indexAttachment({
    job_id: 'job-attachment-limit',
    tenant_id: 'tenant-attachment',
    attachment_id: 9003,
    page_id: 101,
    book_id: 10,
    chapter_id: 1001,
    shelf_id: 1,
    path: ['平台手册', '认证附件'],
    file_name: 'too-many-pages.pdf',
    file_size_bytes: 1024,
    source_url: 'https://example.com/too-many-pages.pdf',
    permission_scope: { books: [10], pages: [101] },
    documentParseClient,
  }), /page limit/);

  assert.equal(repositories.indexJobs.getById('job-attachment-limit').status, 'failed');
});
