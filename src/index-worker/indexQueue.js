import { createQueueConfig } from './queueConfig.js';
import { buildIdempotencyKey, createProcessedEventStore } from './idempotency.js';

function nowIso(now) {
  return typeof now === 'function' ? now() : new Date().toISOString();
}

function retryDelay(config, attemptCount) {
  return config.retryScheduleMs[Math.min(attemptCount, config.retryScheduleMs.length - 1)];
}

export function createIndexQueue({
  streamClient,
  repositories,
  config = createQueueConfig(),
  processedEvents = createProcessedEventStore(),
  logger,
  now = () => new Date().toISOString(),
} = {}) {
  if (!streamClient) {
    throw new Error('streamClient is required.');
  }
  if (!repositories?.indexJobs) {
    throw new Error('repositories.indexJobs is required.');
  }

  function enqueue(stream, payload) {
    const idempotency_key = buildIdempotencyKey(payload);
    const message = {
      id: payload.event_id,
      idempotency_key,
      payload,
      enqueued_at: nowIso(now),
    };
    streamClient.append(stream, message);
    logger?.info?.('queue.enqueued', { stream, event_id: payload.event_id, idempotency_key });
    return message;
  }

  function recordJob(payload, status, extra = {}) {
    return repositories.indexJobs.upsert({
      job_id: payload.event_id,
      tenant_id: payload.tenant_id,
      entity_type: payload.entity_type ?? 'page',
      entity_id: String(payload.entity_id ?? payload.page_id ?? ''),
      event_type: payload.event_type,
      status,
      attempt_count: extra.attempt_count ?? 0,
      failure_reason: extra.failure_reason,
      queued_at: extra.queued_at ?? nowIso(now),
      processed_at: extra.processed_at,
    });
  }

  return {
    config,
    enqueue(payload) {
      const message = enqueue(config.streams.main, payload);
      recordJob(payload, 'queued', { queued_at: message.enqueued_at, attempt_count: 0 });
      return message;
    },
    processNext(processor) {
      const message = streamClient.shift(config.streams.main) ?? streamClient.shift(config.streams.retry);
      if (!message) {
        return null;
      }

      const key = message.idempotency_key;
      if (processedEvents.has(key)) {
        logger?.warn?.('queue.duplicate_skipped', { event_id: message.payload.event_id, idempotency_key: key });
        recordJob(message.payload, 'duplicate_skipped', {
          attempt_count: message.payload.attempt_count ?? 0,
          processed_at: nowIso(now),
        });
        return { status: 'duplicate_skipped', message };
      }

      try {
        const result = processor(message.payload);
        processedEvents.add(key);
        recordJob(message.payload, 'processed', {
          attempt_count: message.payload.attempt_count ?? 0,
          processed_at: nowIso(now),
        });
        logger?.info?.('queue.processed', { event_id: message.payload.event_id, idempotency_key: key });
        return { status: 'processed', message, result };
      } catch (error) {
        const nextAttempt = (message.payload.attempt_count ?? 0) + 1;
        const failure_reason = error.message;
        if (nextAttempt >= config.maxRetries) {
          const failedPayload = {
            ...message.payload,
            attempt_count: nextAttempt,
            failure_reason,
          };
          enqueue(config.streams.dlq, failedPayload);
          recordJob(failedPayload, 'failed', {
            attempt_count: nextAttempt,
            processed_at: nowIso(now),
            failure_reason,
          });
          logger?.error?.('queue.failed', { event_id: message.payload.event_id, attempt_count: nextAttempt, failure_reason });
          return { status: 'failed', message, error };
        }

        const retryPayload = {
          ...message.payload,
          attempt_count: nextAttempt,
          retry_after_ms: retryDelay(config, nextAttempt - 1),
          failure_reason,
        };
        enqueue(config.streams.retry, retryPayload);
        recordJob(retryPayload, 'retry_scheduled', {
          attempt_count: nextAttempt,
          failure_reason,
        });
        logger?.warn?.('queue.retry_scheduled', { event_id: message.payload.event_id, attempt_count: nextAttempt, failure_reason });
        return { status: 'retry_scheduled', message, error };
      }
    },
    getStream(stream) {
      return streamClient.read(stream);
    },
  };
}
