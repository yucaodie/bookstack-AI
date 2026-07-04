import { createHash } from 'node:crypto';

function splitSentences(text) {
  return text
    .split(/(?<=[。！？!?\n])|(?<=\.)\s+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function makeContentHash(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function chunkNormalizedText({
  normalizedText,
  pathText,
  maxChunkLength = 180,
  overlap = 24,
} = {}) {
  if (!normalizedText || typeof normalizedText !== 'string') {
    throw new Error('normalizedText must be a non-empty string.');
  }

  const sentences = splitSentences(normalizedText);
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxChunkLength) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current.trim());
      current = `${current.slice(Math.max(0, current.length - overlap)).trim()} ${sentence}`.trim();
      continue;
    }

    chunks.push(sentence);
  }

  if (current) {
    chunks.push(current.trim());
  }

  return chunks.map((content_text, chunk_index) => ({
    chunk_index,
    path_text: pathText,
    content_text,
    content_hash: makeContentHash(content_text),
  }));
}
