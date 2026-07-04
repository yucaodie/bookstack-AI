export function createPromptOrchestrator({ logger } = {}) {
  return {
    compose({ question, citations = [] } = {}) {
      const evidenceInsufficient = citations.length === 0;
      const prompt = {
        system: evidenceInsufficient
          ? 'Answer carefully. State that the current evidence is insufficient and ask the user to narrow scope or add documents.'
          : 'Answer using enterprise knowledge and cite evidence.',
        question,
        citations,
        evidence_insufficient: evidenceInsufficient,
      };
      logger?.info('prompt.composed', { citationCount: citations.length, evidence_insufficient: evidenceInsufficient });
      return prompt;
    },
  };
}
