export const STREAMS = Object.freeze({
  main: 'index_events',
  retry: 'index_events_retry',
  dlq: 'index_events_dlq',
});

export const DEFAULT_CONSUMER_GROUP = 'index_workers';

export function createQueueConfig({
  consumerGroup = DEFAULT_CONSUMER_GROUP,
  maxRetries = 3,
  retryScheduleMs = [1000, 5000, 15000],
} = {}) {
  if (!Number.isInteger(maxRetries) || maxRetries < 1) {
    throw new Error('maxRetries must be a positive integer.');
  }
  if (!Array.isArray(retryScheduleMs) || retryScheduleMs.length === 0) {
    throw new Error('retryScheduleMs must be a non-empty array.');
  }

  return {
    streams: STREAMS,
    consumerGroup,
    maxRetries,
    retryScheduleMs,
  };
}
