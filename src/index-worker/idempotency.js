export function buildIdempotencyKey({ event_id, entity_id, version_ts } = {}) {
  if (!event_id || !entity_id || !version_ts) {
    throw new Error('event_id, entity_id and version_ts are required.');
  }

  return `${event_id}:${entity_id}:${version_ts}`;
}

export function createProcessedEventStore() {
  const processed = new Set();
  return {
    has(key) {
      return processed.has(key);
    },
    add(key) {
      processed.add(key);
    },
    size() {
      return processed.size;
    },
  };
}
