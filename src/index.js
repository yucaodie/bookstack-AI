export {
  AiGatewayError,
  createAiGatewayClient,
} from './bookstack-extension/aiGatewayClient.js';
export {
  SUPPORTED_QUERY_SCOPES,
  buildQueryContext,
} from './bookstack-extension/queryScope.js';
export {
  SUPPORTED_PAGE_EVENTS,
  createPageEventPublisher,
} from './bookstack-extension/pageEvents.js';
export { createSidebarStateController } from './bookstack-extension/sidebarState.js';
export { createBookStackAiExtension } from './bookstack-extension/bookstackAiExtension.js';
export { createAiGatewayConfig } from './ai-gateway/config.js';
export { createStructuredLogger } from './ai-gateway/logger.js';
export { AuthError, createAuthContextResolver } from './ai-gateway/authContextResolver.js';
export { createRetrievalService } from './ai-gateway/retrievalService.js';
export { createPromptOrchestrator } from './ai-gateway/promptOrchestrator.js';
export { createInferenceAdapter } from './ai-gateway/inferenceAdapter.js';
export { createAuditLogger } from './ai-gateway/auditLogger.js';
export { ApiAccessError, createApiAccessManager } from './ai-gateway/apiAccessManager.js';
export { createHealthService } from './ai-gateway/health.js';
export { createAiGatewayApp } from './ai-gateway/app.js';
export {
  TABLES,
  EMBEDDING_DIMENSION,
  CREATE_EXTENSION_SQL,
  CREATE_TABLE_STATEMENTS,
  INDEX_STATEMENTS,
  buildSchemaStatements,
} from './storage/schema.js';
export { createInitialMigration, listMigrations } from './storage/migrations.js';
export {
  validateKnowledgeChunk,
  validateIndexJob,
  validateAiQueryLog,
  validateApiClient,
  validateEmbeddingProfile,
} from './storage/validators.js';
export { createStorageRepositories } from './storage/repositories.js';
export { STREAMS, DEFAULT_CONSUMER_GROUP, createQueueConfig } from './index-worker/queueConfig.js';
export { buildIdempotencyKey, createProcessedEventStore } from './index-worker/idempotency.js';
export { createMemoryStreamClient } from './index-worker/memoryStreamClient.js';
export { createIndexQueue } from './index-worker/indexQueue.js';
export { normalizeBookStackContent } from './indexing/normalizer.js';
export { chunkNormalizedText } from './indexing/chunker.js';
export { createManagedChineseEmbeddingProvider } from './indexing/embeddingProvider.js';
export { createDocumentParseClient } from './indexing/documentParseClient.js';
export { createContentLifecycleManager } from './indexing/contentLifecycle.js';
export { createIndexingPipeline } from './indexing/indexingPipeline.js';
