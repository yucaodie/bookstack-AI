function textToVector(text, dimension) {
  const vector = new Array(dimension).fill(0);
  for (let index = 0; index < text.length; index += 1) {
    vector[index % dimension] += text.charCodeAt(index) % 97;
  }
  return vector.map((value) => Number((value / 100).toFixed(4)));
}

export function createManagedChineseEmbeddingProvider({
  providerName = 'managed-chinese-embedding',
  modelName = 'zh-embedding-v1',
  dimension = 16,
} = {}) {
  return {
    providerName,
    modelName,
    dimension,
    async embed(texts) {
      if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('texts must be a non-empty array.');
      }
      return texts.map((text) => textToVector(text, dimension));
    },
  };
}
