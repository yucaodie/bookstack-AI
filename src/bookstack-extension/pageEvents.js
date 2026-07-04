export const SUPPORTED_PAGE_EVENTS = Object.freeze([
  'page.created',
  'page.updated',
  'page.deleted',
  'page.moved',
]);

function defaultEventId() {
  return crypto.randomUUID();
}

export function createPageEventPublisher({
  client,
  tenantId,
  createId = defaultEventId,
  now = () => new Date().toISOString(),
} = {}) {
  if (!client?.sendIndexEvent) {
    throw new Error('client.sendIndexEvent is required.');
  }
  if (!tenantId) {
    throw new Error('tenantId is required.');
  }

  return {
    async publish(eventType, payload) {
      if (!SUPPORTED_PAGE_EVENTS.includes(eventType)) {
        throw new Error(`Unsupported page event: ${eventType}`);
      }

      const body = {
        event_id: createId(),
        event_type: eventType,
        tenant_id: tenantId,
        occurred_at: now(),
        ...payload,
      };

      return client.sendIndexEvent(body);
    },
  };
}
