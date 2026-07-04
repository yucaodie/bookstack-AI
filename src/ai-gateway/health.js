export function createHealthService({ config, logger, repositories, dependencyStatus = {} } = {}) {
  return {
    report() {
      const auditRecords = repositories?.aiQueryLogs?.listAll?.() ?? [];
      const indexJobs = repositories?.indexJobs?.listAll?.() ?? [];
      const activeChunks = repositories?.knowledgeChunks?.listAll?.().filter((record) => record.is_active === true) ?? [];
      const health = {
        status: 'ok',
        environment: config.environment,
        model_provider: config.modelProvider,
        embedding_model: config.embeddingModel,
        services: {
          inference: dependencyStatus.inference ?? 'ok',
          retrieval: dependencyStatus.retrieval ?? 'ok',
          queue: dependencyStatus.queue ?? 'ok',
          document_parse: dependencyStatus.document_parse ?? 'ok',
        },
        metrics: config.metrics,
        observability: {
          audit_records: auditRecords.length,
          indexed_chunks: activeChunks.length,
          failed_index_jobs: indexJobs.filter((record) => record.status === 'failed').length,
        },
      };
      logger?.info('health.reported', health);
      return health;
    },
  };
}
