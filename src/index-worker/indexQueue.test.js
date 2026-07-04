import test from 'node:test';
import assert from 'node:assert/strict';

import { createStorageRepositories } from '../storage/repositories.js';
import { createQueueConfig, STREAMS } from './queueConfig.js';
import { buildIdempotencyKey, createProcessedEventStore } from './idempotency.js';
import { createMemoryStreamClient } from './memoryStreamClient.js';
import { createIndexQueue } from './indexQueue.js';

function createEvent(overrides = {}) {
  return {
    event_id: 'evt-1',
    event_type: 'page.updated',
    tenant_id: 'tenant-01',
    entity_type: 'page',
    entity_id: '101',
    page_id: 101,
    version_ts: '2026-07-03T00:00:00Z',
    ...overrides,
  };
}

test('queue config 提供固定流名和重试配置', () => {
  const config = createQueueConfig({ maxRetries: 5, retryScheduleMs: [1000, 2000] });

  assert.deepEqual(config.streams, STREAMS);
  assert.equal(config.maxRetries, 5);
  assert.deepEqual(config.retryScheduleMs, [1000, 2000]);
});

test('idempotency key 由 event_id、entity_id 和 version_ts 组成', () => {
  const key = buildIdempotencyKey(createEvent());
  assert.equal(key, 'evt-1:101:2026-07-03T00:00:00Z');
});

test('enqueue 会写入主流并创建 queued job', () => {
  const repositories = createStorageRepositories();
  const queue = createIndexQueue({
    streamClient: createMemoryStreamClient(STREAMS),
    repositories,
    now: () => '2026-07-03T01:00:00Z',
  });

  queue.enqueue(createEvent());

  assert.equal(queue.getStream(STREAMS.main).length, 1);
  assert.equal(repositories.indexJobs.getById('evt-1').status, 'queued');
});

test('processNext 成功时记录 processed 并跳过重复事件', () => {
  const repositories = createStorageRepositories();
  const processedEvents = createProcessedEventStore();
  const queue = createIndexQueue({
    streamClient: createMemoryStreamClient(STREAMS),
    repositories,
    processedEvents,
    now: () => '2026-07-03T01:00:00Z',
  });

  queue.enqueue(createEvent());
  const first = queue.processNext(() => ({ ok: true }));
  queue.enqueue(createEvent());
  const second = queue.processNext(() => ({ ok: true }));

  assert.equal(first.status, 'processed');
  assert.equal(second.status, 'duplicate_skipped');
  assert.equal(repositories.indexJobs.getById('evt-1').status, 'duplicate_skipped');
});

test('processNext 失败时先进入 retry 流，达到阈值后进入 dlq', () => {
  const repositories = createStorageRepositories();
  const queue = createIndexQueue({
    streamClient: createMemoryStreamClient(STREAMS),
    repositories,
    config: createQueueConfig({ maxRetries: 3, retryScheduleMs: [100, 200, 300] }),
    now: () => '2026-07-03T01:00:00Z',
  });

  queue.enqueue(createEvent());
  const first = queue.processNext(() => {
    throw new Error('temporary failure');
  });
  const second = queue.processNext(() => {
    throw new Error('temporary failure');
  });
  const third = queue.processNext(() => {
    throw new Error('terminal failure');
  });

  assert.equal(first.status, 'retry_scheduled');
  assert.equal(second.status, 'retry_scheduled');
  assert.equal(third.status, 'failed');
  assert.equal(queue.getStream(STREAMS.retry).length, 0);
  assert.equal(queue.getStream(STREAMS.dlq).length, 1);
  assert.equal(repositories.indexJobs.getById('evt-1').status, 'failed');
  assert.equal(repositories.indexJobs.getById('evt-1').attempt_count, 3);
});
