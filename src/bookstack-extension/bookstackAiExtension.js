import { createAiGatewayClient } from './aiGatewayClient.js';
import { createPageEventPublisher } from './pageEvents.js';
import { buildQueryContext } from './queryScope.js';
import { createSidebarStateController } from './sidebarState.js';

export function createBookStackAiExtension({
  gateway,
  gatewayConfig,
  storage,
  tenantId,
  userId,
  currentPageId,
  currentBookId,
  accessibleScope,
  onStateChange,
  createId,
  now,
} = {}) {
  const client = gateway || createAiGatewayClient(gatewayConfig);
  const sidebar = createSidebarStateController({ storage, onStateChange });
  const pageEvents = createPageEventPublisher({
    client,
    tenantId,
    createId,
    now,
  });

  return {
    sidebar,

    async askQuestion({ question, mode = 'page', conversationId } = {}) {
      const context = buildQueryContext({
        mode,
        currentPageId,
        currentBookId,
        accessibleScope,
        tenantId,
        userId,
        conversationId,
      });

      const response = await client.query({
        ...context,
        question,
      });

      sidebar.setConversation({
        question,
        mode,
        conversationId: response?.request_id || conversationId || null,
      });

      return response;
    },

    async askQuestionStream({ question, mode = 'page', conversationId, onEvent } = {}) {
      const context = buildQueryContext({
        mode,
        currentPageId,
        currentBookId,
        accessibleScope,
        tenantId,
        userId,
        conversationId,
      });

      const events = await client.queryStream({
        ...context,
        question,
      });
      let requestId = conversationId || null;
      let answer = '';
      const citations = [];
      for (const event of events) {
        if (event.event === 'start') {
          requestId = event.data.request_id;
        }
        if (event.event === 'delta') {
          answer += event.data.text;
        }
        if (event.event === 'citation') {
          citations.push(event.data);
        }
        onEvent?.(event);
      }

      sidebar.setConversation({
        question,
        mode,
        conversationId: requestId,
      });

      return {
        request_id: requestId,
        answer,
        citations,
      };
    },

    async emitPageEvent(eventType, payload) {
      return pageEvents.publish(eventType, payload);
    },

    async healthCheck() {
      return client.healthCheck();
    },
  };
}
