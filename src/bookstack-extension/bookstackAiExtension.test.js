import test from 'node:test';
import assert from 'node:assert/strict';

import { AiGatewayError, createAiGatewayClient } from './aiGatewayClient.js';
import { createBookStackAiExtension } from './bookstackAiExtension.js';
import { buildQueryContext } from './queryScope.js';
import { createSidebarStateController } from './sidebarState.js';

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
  };
}

test('buildQueryContext 在 page 模式下固定当前页范围', () => {
  const context = buildQueryContext({
    mode: 'page',
    currentPageId: 101,
    currentBookId: 10,
    accessibleScope: { books: [10, 11], pages: [1, 2, 3] },
    tenantId: 'tenant-01',
    userId: 'user-01',
  });

  assert.equal(context.scope_mode, 'page');
  assert.deepEqual(context.scopes.pages, [101]);
  assert.deepEqual(context.scopes.books, [10, 11]);
});

test('buildQueryContext 在 book 模式下固定当前书范围', () => {
  const context = buildQueryContext({
    mode: 'book',
    currentPageId: 101,
    currentBookId: 10,
    accessibleScope: { books: [88], pages: [1, 2, 3] },
  });

  assert.equal(context.scope_mode, 'book');
  assert.deepEqual(context.scopes.books, [10]);
  assert.deepEqual(context.scopes.pages, []);
});

test('sidebar 控制器会持久化折叠状态和会话', () => {
  const storage = createMemoryStorage();
  const sidebar = createSidebarStateController({ storage });

  assert.equal(sidebar.isCollapsed(), false);
  sidebar.toggle();
  sidebar.setConversation({ id: 'req-1', question: 'hello' });

  const restored = createSidebarStateController({ storage });
  assert.equal(restored.isCollapsed(), true);
  assert.deepEqual(restored.getConversation(), { id: 'req-1', question: 'hello' });
});

test('AI Gateway 客户端会构造内部 query 请求', async () => {
  const calls = [];
  const client = createAiGatewayClient({
    baseUrl: 'https://example.com',
    serviceToken: 'secret-token',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({ ok: true, request_id: 'req-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const response = await client.query({ question: 'test' });
  assert.equal(response.request_id, 'req-1');
  assert.equal(calls[0].url, 'https://example.com/internal/ai/query');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.authorization, 'Bearer secret-token');
});

test('AI Gateway 客户端会把错误映射为 AiGatewayError', async () => {
  const client = createAiGatewayClient({
    baseUrl: 'https://example.com',
    serviceToken: 'secret-token',
    fetchImpl: async () => new Response(JSON.stringify({ code: 'throttled', message: 'too many requests' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    }),
  });

  await assert.rejects(() => client.query({ question: 'test' }), (error) => {
    assert.ok(error instanceof AiGatewayError);
    assert.equal(error.code, 'throttled');
    assert.equal(error.status, 429);
    return true;
  });
});

test('AI Gateway 客户端会解析 SSE 事件流', async () => {
  const client = createAiGatewayClient({
    baseUrl: 'https://example.com',
    serviceToken: 'secret-token',
    fetchImpl: async () => new Response([
      'event: start',
      'data: {"request_id":"req-stream"}',
      '',
      'event: delta',
      'data: {"text":"片段一"}',
      '',
      'event: done',
      'data: {"request_id":"req-stream"}',
      '',
    ].join('\n'), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
  });

  const events = await client.queryStream({ question: 'test' });
  assert.deepEqual(events.map((item) => item.event), ['start', 'delta', 'done']);
});

test('BookStack 扩展会发送带上下文的问答请求并保留会话', async () => {
  const storage = createMemoryStorage();
  const calls = [];
  const extension = createBookStackAiExtension({
    storage,
    tenantId: 'tenant-01',
    userId: 'user-01',
    currentPageId: 101,
    currentBookId: 10,
    accessibleScope: { shelves: [1], books: [10, 11], chapters: [9], pages: [101, 102] },
    gateway: {
      async query(payload) {
        calls.push(payload);
        return { request_id: 'req-42', answer: 'ok' };
      },
      async sendIndexEvent() {
        return { accepted: true };
      },
      async healthCheck() {
        return { status: 'ok' };
      },
    },
  });

  const response = await extension.askQuestion({ question: '如何接入单点登录？', mode: 'book' });
  assert.equal(response.request_id, 'req-42');
  assert.equal(calls[0].scope_mode, 'book');
  assert.deepEqual(calls[0].scopes.books, [10]);
  assert.equal(extension.sidebar.getConversation().conversationId, 'req-42');
});

test('BookStack 扩展会发布页面索引事件', async () => {
  const storage = createMemoryStorage();
  const events = [];
  const extension = createBookStackAiExtension({
    storage,
    tenantId: 'tenant-01',
    gateway: {
      async query() {
        return { request_id: 'req-1' };
      },
      async sendIndexEvent(payload) {
        events.push(payload);
        return { accepted: true };
      },
      async healthCheck() {
        return { status: 'ok' };
      },
    },
    createId: () => 'evt-1',
    now: () => '2026-07-03T00:00:00Z',
  });

  await extension.emitPageEvent('page.updated', { page_id: 101, actor_id: 'user-01' });

  assert.deepEqual(events[0], {
    event_id: 'evt-1',
    event_type: 'page.updated',
    tenant_id: 'tenant-01',
    occurred_at: '2026-07-03T00:00:00Z',
    page_id: 101,
    actor_id: 'user-01',
  });
});

test('BookStack 扩展会消费 SSE 事件并聚合答案与引用', async () => {
  const storage = createMemoryStorage();
  const received = [];
  const extension = createBookStackAiExtension({
    storage,
    tenantId: 'tenant-01',
    userId: 'user-01',
    currentPageId: 101,
    currentBookId: 10,
    accessibleScope: { books: [10], pages: [101] },
    gateway: {
      async query() {
        return { request_id: 'req-unused' };
      },
      async queryStream() {
        return [
          { event: 'start', data: { request_id: 'req-stream' } },
          { event: 'delta', data: { text: '第一段' } },
          { event: 'delta', data: { text: '第二段' } },
          { event: 'citation', data: { chunk_id: 'chunk-1', page_id: 101 } },
          { event: 'done', data: { request_id: 'req-stream' } },
        ];
      },
      async sendIndexEvent() {
        return { accepted: true };
      },
      async healthCheck() {
        return { status: 'ok' };
      },
    },
  });

  const result = await extension.askQuestionStream({
    question: '如何接入单点登录？',
    mode: 'page',
    onEvent: (event) => received.push(event.event),
  });

  assert.equal(result.request_id, 'req-stream');
  assert.equal(result.answer, '第一段第二段');
  assert.equal(result.citations.length, 1);
  assert.deepEqual(received, ['start', 'delta', 'delta', 'citation', 'done']);
  assert.equal(extension.sidebar.getConversation().conversationId, 'req-stream');
});
