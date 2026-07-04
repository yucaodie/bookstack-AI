export const SUPPORTED_QUERY_SCOPES = Object.freeze(['page', 'book', 'workspace']);

function normalizeScopeItems(items) {
  return Array.isArray(items) ? items.filter((item) => item !== null && item !== undefined) : [];
}

export function buildQueryContext({
  mode = 'page',
  currentPageId,
  currentBookId,
  accessibleScope = {},
  tenantId,
  userId,
  conversationId,
} = {}) {
  if (!SUPPORTED_QUERY_SCOPES.includes(mode)) {
    throw new Error(`Unsupported query mode: ${mode}`);
  }

  const scopes = {
    shelves: normalizeScopeItems(accessibleScope.shelves),
    books: normalizeScopeItems(accessibleScope.books),
    chapters: normalizeScopeItems(accessibleScope.chapters),
    pages: normalizeScopeItems(accessibleScope.pages),
  };

  if (mode === 'page') {
    if (!currentPageId) {
      throw new Error('currentPageId is required for page scope.');
    }
    scopes.pages = [currentPageId];
  }

  if (mode === 'book') {
    if (!currentBookId) {
      throw new Error('currentBookId is required for book scope.');
    }
    scopes.books = [currentBookId];
    scopes.pages = [];
  }

  return {
    tenant_id: tenantId,
    user_id: userId,
    conversation_id: conversationId,
    scope_mode: mode,
    scopes,
    context_page_id: currentPageId ?? null,
    context_book_id: currentBookId ?? null,
  };
}
