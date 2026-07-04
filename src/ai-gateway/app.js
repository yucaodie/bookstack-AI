import { randomUUID } from 'node:crypto';

import { createAiGatewayConfig } from './config.js';
import { createStructuredLogger } from './logger.js';
import { AuthError, createAuthContextResolver } from './authContextResolver.js';
import { createRetrievalService } from './retrievalService.js';
import { createPromptOrchestrator } from './promptOrchestrator.js';
import { createInferenceAdapter } from './inferenceAdapter.js';
import { createAuditLogger } from './auditLogger.js';
import { ApiAccessError, createApiAccessManager } from './apiAccessManager.js';
import { createHealthService } from './health.js';

function json(status, body) {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body,
  };
}

function sse(status, body) {
  return {
    status,
    headers: { 'content-type': 'text/event-stream' },
    body,
  };
}

function formatSseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function createAuditEntry({
  requestId,
  tenantId,
  actorId,
  question,
  channel,
  modelName,
  retrieval,
  usage,
  status,
  answer,
}) {
  return {
    request_id: requestId,
    tenant_id: tenantId,
    channel,
    user_id_or_client_id: actorId,
    question_text: question,
    retrieved_chunk_ids: retrieval.chunks.map((item) => item.chunk_id),
    answer_summary: answer?.slice(0, 200),
    model_name: modelName,
    prompt_tokens: usage?.prompt_tokens ?? 0,
    completion_tokens: usage?.completion_tokens ?? 0,
    latency_ms: 0,
    status,
  };
}

function createAuditHistoryHandler({ authResolver, auditLogger }) {
  return async ({ headers, body }) => {
    const authContext = authResolver.resolve(headers, body);
    return json(200, {
      entries: auditLogger.queryHistory({
        tenantId: authContext.tenantId,
        status: body.status,
        channel: body.channel,
        limit: body.limit ?? 20,
      }),
    });
  };
}

function createObservabilityHandler({ authResolver, healthService, auditLogger }) {
  return async ({ headers, body }) => {
    authResolver.resolve(headers, body);
    return json(200, {
      health: healthService.report(),
      audit_retained_records: auditLogger.entries.length,
    });
  };
}

function createQueryHandler({ authResolver, retrievalService, promptOrchestrator, inferenceAdapter, auditLogger, config }) {
  return async ({ headers, body }) => {
    const authContext = authResolver.resolve(headers, body);
    const filter = retrievalService.buildFilter({
      tenantId: authContext.tenantId,
      scopeMode: authContext.scopeMode,
      scopes: authContext.scopes,
      languageCode: body.language_code ?? 'zh-CN',
    });
    const retrieval = retrievalService.retrieve({
      question: body.question,
      filter,
    });
    config.metrics.retrievalRequests += 1;
    const prompt = promptOrchestrator.compose({
      question: body.question,
      citations: retrieval.citations,
    });
    const requestId = body.request_id ?? randomUUID();
    config.metrics.requests += 1;

    if (body.stream === true) {
      config.metrics.streamRequests += 1;
      const chunks = [];
      for await (const event of inferenceAdapter.generateStream({ prompt, requestId })) {
        chunks.push(formatSseEvent(event.event, event.data));
      }
      auditLogger.record(createAuditEntry({
        requestId,
        tenantId: authContext.tenantId,
        actorId: authContext.userId,
        question: body.question,
        channel: 'internal',
        modelName: config.embeddingModel,
        retrieval,
        usage: { prompt_tokens: body.question?.length ?? 0, completion_tokens: 16 },
        status: 'completed',
        answer: chunks.join(''),
      }));
      return sse(200, chunks.join(''));
    }

    const result = await inferenceAdapter.generate({ prompt });
    auditLogger.record(createAuditEntry({
      requestId,
      tenantId: authContext.tenantId,
      actorId: authContext.userId,
      question: body.question,
      channel: 'internal',
      modelName: config.embeddingModel,
      retrieval,
      usage: result.usage,
      status: 'completed',
      answer: result.answer,
    }));

    return json(200, {
      request_id: requestId,
      answer: result.answer,
      citations: result.citations,
      usage: result.usage,
    });
  };
}

function createExternalQueryHandler({ apiAccessManager, retrievalService, promptOrchestrator, inferenceAdapter, auditLogger, config }) {
  return async ({ headers, body }) => {
    const client = apiAccessManager.authenticate(headers);
    apiAccessManager.assertRateLimit(client);
    const resolvedScope = apiAccessManager.resolveClientScope({
      tenantId: client.tenant_id,
      allowedScope: client.allowed_scope,
      requestedScope: body.scopes ?? {},
    });
    const filter = retrievalService.buildFilter({
      tenantId: client.tenant_id,
      scopeMode: body.scope_mode ?? 'workspace',
      scopes: resolvedScope.allowed_scope,
      languageCode: body.language_code ?? 'zh-CN',
    });
    const retrieval = retrievalService.retrieve({ question: body.question, filter });
    config.metrics.retrievalRequests += 1;
    const prompt = promptOrchestrator.compose({
      question: body.question,
      citations: retrieval.citations,
    });
    const requestId = body.request_id ?? randomUUID();
    config.metrics.requests += 1;
    config.metrics.externalRequests += 1;

    if (body.stream === true) {
      config.metrics.streamRequests += 1;
      const chunks = [];
      for await (const event of inferenceAdapter.generateStream({ prompt, requestId })) {
        chunks.push(formatSseEvent(event.event, event.data));
      }
      auditLogger.record(createAuditEntry({
        requestId,
        tenantId: client.tenant_id,
        actorId: client.client_id,
        question: body.question,
        channel: 'external',
        modelName: config.embeddingModel,
        retrieval,
        usage: { prompt_tokens: body.question?.length ?? 0, completion_tokens: 16 },
        status: 'completed',
        answer: chunks.join(''),
      }));
      return sse(200, chunks.join(''));
    }

    const result = await inferenceAdapter.generate({ prompt });
    auditLogger.record(createAuditEntry({
      requestId,
      tenantId: client.tenant_id,
      actorId: client.client_id,
      question: body.question,
      channel: 'external',
      modelName: config.embeddingModel,
      retrieval,
      usage: result.usage,
      status: 'completed',
      answer: result.answer,
    }));

    return json(200, {
      request_id: requestId,
      answer: result.answer,
      citations: result.citations,
      usage: result.usage,
    });
  };
}

function createIndexEventHandler({ authResolver, logger, config }) {
  return async ({ headers, body }) => {
    authResolver.resolve(headers, body);
    config.metrics.requests += 1;
    logger.info('index.event.accepted', {
      event_id: body.event_id,
      event_type: body.event_type,
    });
    return json(202, {
      accepted: true,
      event_id: body.event_id,
    });
  };
}

export function createAiGatewayApp({ serviceToken, loggerSink, auditSink, repositories, retrieval } = {}) {
  const config = createAiGatewayConfig({ serviceToken, retrieval });
  const logger = createStructuredLogger({ sink: loggerSink ?? [] });
  const authResolver = createAuthContextResolver({
    serviceToken: config.serviceToken,
    logger,
    metrics: config.metrics,
  });
  const retrievalService = createRetrievalService({ logger, repositories, topK: config.retrieval.topK });
  const promptOrchestrator = createPromptOrchestrator({ logger });
  const inferenceAdapter = createInferenceAdapter({
    logger,
    modelProvider: config.modelProvider,
    embeddingModel: config.embeddingModel,
  });
  const auditLogger = createAuditLogger({ sink: auditSink ?? [], logger, repositories });
  const apiAccessManager = createApiAccessManager({
    logger,
    repositories,
    defaultRateLimit: config.limits.queryPerMinute,
  });
  const healthService = createHealthService({
    config,
    logger,
    repositories,
  });

  const routes = new Map([
    ['POST /internal/ai/query', createQueryHandler({ authResolver, retrievalService, promptOrchestrator, inferenceAdapter, auditLogger, config })],
    ['POST /v1/rag/query', createExternalQueryHandler({ apiAccessManager, retrievalService, promptOrchestrator, inferenceAdapter, auditLogger, config })],
    ['POST /internal/ai/index/events', createIndexEventHandler({ authResolver, logger, config })],
    ['POST /internal/ai/audit/query', createAuditHistoryHandler({ authResolver, auditLogger })],
    ['GET /internal/ai/observability', createObservabilityHandler({ authResolver, healthService, auditLogger })],
    ['GET /internal/ai/health', async () => json(200, healthService.report())],
  ]);

  return {
    config,
    logger,
    modules: {
      authResolver,
      retrievalService,
      promptOrchestrator,
      inferenceAdapter,
      auditLogger,
      apiAccessManager,
      healthService,
    },
    async handle({ method, path, headers = {}, body = {} }) {
      const key = `${method} ${path}`;
      const route = routes.get(key);
      if (!route) {
        config.metrics.routeNotFound += 1;
        logger.warn('route.not_found', { method, path });
        return json(404, {
          code: 'route_not_found',
          message: 'Route not found.',
        });
      }

      try {
        return await route({ headers, body });
      } catch (error) {
        if (error instanceof AuthError) {
          return json(error.status, {
            code: error.code,
            message: error.message,
          });
        }
        if (error instanceof ApiAccessError) {
          return json(error.status, {
            code: error.code,
            message: error.message,
          });
        }
        logger.error('route.failed', {
          method,
          path,
          error: error.message,
        });
        return json(500, {
          code: 'internal_error',
          message: 'Internal server error.',
        });
      }
    },
  };
}
