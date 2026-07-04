function redactText(value) {
  if (!value) {
    return value ?? '';
  }
  return String(value).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]');
}

function isExpired(entry, cutoffTime) {
  const createdAt = entry.created_at ?? entry.recorded_at;
  return createdAt ? Date.parse(createdAt) < cutoffTime : false;
}

export function createAuditLogger({
  sink = [],
  logger,
  repositories,
  now = () => new Date().toISOString(),
  retentionDays = 30,
} = {}) {
  return {
    record(entry) {
      const record = {
        ...entry,
        created_at: entry.created_at ?? now(),
      };
      sink.push(record);
      repositories?.aiQueryLogs?.upsert({
        request_id: record.request_id,
        tenant_id: record.tenant_id,
        channel: record.channel,
        user_id_or_client_id: record.user_id_or_client_id,
        question_text: record.question_text,
        retrieved_chunk_ids: record.retrieved_chunk_ids,
        answer_summary: record.answer_summary,
        model_name: record.model_name,
        prompt_tokens: record.prompt_tokens,
        completion_tokens: record.completion_tokens,
        latency_ms: record.latency_ms,
        status: record.status,
        created_at: record.created_at,
      });
      logger?.info('audit.recorded', {
        request_id: record.request_id,
        tenant_id: record.tenant_id,
      });
      return record;
    },
    queryHistory({ tenantId, status, channel, limit = 20 } = {}) {
      const source = repositories?.aiQueryLogs?.listByTenant(tenantId) ?? sink.filter((entry) => entry.tenant_id === tenantId);
      return source
        .filter((entry) => (status ? entry.status === status : true))
        .filter((entry) => (channel ? entry.channel === channel : true))
        .sort((left, right) => Date.parse(right.created_at ?? 0) - Date.parse(left.created_at ?? 0))
        .slice(0, limit)
        .map((entry) => ({
          request_id: entry.request_id,
          tenant_id: entry.tenant_id,
          channel: entry.channel,
          user_id_or_client_id: entry.user_id_or_client_id,
          question_text: redactText(entry.question_text),
          answer_summary: redactText(entry.answer_summary),
          retrieved_chunk_ids: entry.retrieved_chunk_ids,
          model_name: entry.model_name,
          prompt_tokens: entry.prompt_tokens,
          completion_tokens: entry.completion_tokens,
          latency_ms: entry.latency_ms,
          status: entry.status,
          created_at: entry.created_at,
        }));
    },
    purgeExpired() {
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      for (let index = sink.length - 1; index >= 0; index -= 1) {
        const entry = sink[index];
        if (isExpired(entry, cutoffTime)) {
          sink.splice(index, 1);
          repositories?.aiQueryLogs?.remove?.(entry.request_id);
        }
      }
      return sink.length;
    },
    entries: sink,
  };
}
