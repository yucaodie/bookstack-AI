function normalizeList(items) {
  return Array.isArray(items) ? items.filter((item) => item !== null && item !== undefined) : [];
}

function hasOverlap(left, right) {
  if (left.length === 0 || right.length === 0) {
    return true;
  }
  const rightSet = new Set(right);
  return left.some((item) => rightSet.has(item));
}

function matchesScopes(chunk, scopes) {
  const requested = {
    shelves: normalizeList(scopes?.shelves),
    books: normalizeList(scopes?.books),
    chapters: normalizeList(scopes?.chapters),
    pages: normalizeList(scopes?.pages),
  };
  const available = {
    shelves: normalizeList(chunk.permission_scope?.shelves ?? (chunk.shelf_id !== null && chunk.shelf_id !== undefined ? [chunk.shelf_id] : [])),
    books: normalizeList(chunk.permission_scope?.books ?? (chunk.book_id !== null && chunk.book_id !== undefined ? [chunk.book_id] : [])),
    chapters: normalizeList(chunk.permission_scope?.chapters ?? (chunk.chapter_id !== null && chunk.chapter_id !== undefined ? [chunk.chapter_id] : [])),
    pages: normalizeList(chunk.permission_scope?.pages ?? (chunk.page_id !== null && chunk.page_id !== undefined ? [chunk.page_id] : [])),
  };

  return hasOverlap(requested.shelves, available.shelves)
    && hasOverlap(requested.books, available.books)
    && hasOverlap(requested.chapters, available.chapters)
    && hasOverlap(requested.pages, available.pages);
}

function buildCitation(record) {
  return {
    chunk_id: record.chunk_id,
    source_type: record.source_type,
    page_id: record.page_id,
    attachment_id: record.attachment_id,
    attachment_page_no: record.attachment_page_no,
    path_text: record.path_text,
    snippet: record.content_text.slice(0, 180),
  };
}

function scoreChunk(question, content) {
  const normalized = String(question ?? '').replace(/[\s，。！？、,.!?;；:：]/g, '');
  const terms = [];
  for (let size = 2; size <= Math.min(4, normalized.length); size += 1) {
    for (let index = 0; index <= normalized.length - size; index += 1) {
      terms.push(normalized.slice(index, index + size));
    }
  }
  if (terms.length === 0) {
    return 0;
  }
  return [...new Set(terms)].reduce((score, term) => score + (content.includes(term) ? 1 : 0), 0);
}

export function createRetrievalService({ logger, repositories, topK = 5 } = {}) {
  return {
    buildFilter({ tenantId, scopeMode, scopes, languageCode = 'zh-CN' } = {}) {
      const filter = {
        tenant_id: tenantId,
        scope_mode: scopeMode,
        scopes: scopes ?? {},
        language_code: languageCode,
      };
      logger?.info('retrieval.filter.built', filter);
      return filter;
    },
    retrieve({ question, filter } = {}) {
      const scopedChunks = repositories?.knowledgeChunks
        ?.listActiveByTenantAndLanguage(filter.tenant_id, filter.language_code)
        .filter((record) => matchesScopes(record, filter.scopes))
        .map((record) => ({ record, score: scoreChunk(question, record.content_text) }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score || left.record.chunk_index - right.record.chunk_index)
        .slice(0, topK)
        .map((item) => item.record) ?? [];

      logger?.info('retrieval.completed', {
        tenant_id: filter?.tenant_id,
        language_code: filter?.language_code,
        result_count: scopedChunks.length,
      });

      return {
        chunks: scopedChunks,
        citations: scopedChunks.map(buildCitation),
      };
    },
  };
}
