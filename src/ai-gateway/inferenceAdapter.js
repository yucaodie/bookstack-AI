export function createInferenceAdapter({ logger, modelProvider, embeddingModel } = {}) {
  function buildAnswer(prompt) {
    if (prompt.evidence_insufficient) {
      return '当前可检索证据不足，建议缩小范围或补充文档后再提问。';
    }
    return `stub-answer:${prompt.question}`;
  }

  return {
    async generate({ prompt }) {
      logger?.info('inference.started', {
        modelProvider,
        embeddingModel,
      });

      return {
        answer: buildAnswer(prompt),
        citations: prompt.citations ?? [],
        usage: {
          prompt_tokens: prompt.question?.length ?? 0,
          completion_tokens: 16,
        },
      };
    },
    async *generateStream({ prompt, requestId }) {
      logger?.info('inference.stream.started', {
        modelProvider,
        embeddingModel,
      });

      const answer = buildAnswer(prompt);
      yield { event: 'start', data: { request_id: requestId, model: embeddingModel } };
      for (const fragment of answer.match(/.{1,12}/gu) ?? []) {
        yield { event: 'delta', data: { text: fragment } };
      }
      for (const citation of prompt.citations ?? []) {
        yield { event: 'citation', data: citation };
      }
      yield {
        event: 'done',
        data: {
          request_id: requestId,
          usage: {
            prompt_tokens: prompt.question?.length ?? 0,
            completion_tokens: 16,
          },
        },
      };
    },
  };
}
