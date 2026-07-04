const DEFAULT_METRICS = Object.freeze({
  requests: 0,
  authFailures: 0,
  routeNotFound: 0,
  retrievalRequests: 0,
  streamRequests: 0,
  externalRequests: 0,
});

export function createAiGatewayConfig({
  serviceToken,
  environment = 'development',
  modelProvider = 'managed-embedding-service',
  embeddingModel = 'zh-default',
  retrieval = {},
  limits = {},
} = {}) {
  if (!serviceToken) {
    throw new Error('serviceToken is required.');
  }

  return {
    serviceToken,
    environment,
    modelProvider,
    embeddingModel,
    retrieval: {
      topK: retrieval.topK ?? 5,
      rerankEnabled: retrieval.rerankEnabled ?? true,
    },
    limits: {
      queryPerMinute: limits.queryPerMinute ?? 60,
      maxPromptChars: limits.maxPromptChars ?? 4000,
    },
    metrics: { ...DEFAULT_METRICS },
  };
}
