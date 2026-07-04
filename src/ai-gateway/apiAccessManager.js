export class ApiAccessError extends Error {
  constructor(message, { status = 401, code = 'invalid_api_key' } = {}) {
    super(message);
    this.name = 'ApiAccessError';
    this.status = status;
    this.code = code;
  }
}

function normalizeList(items) {
  return Array.isArray(items) ? items.filter((item) => item !== null && item !== undefined) : [];
}

function intersectScope(allowedItems, requestedItems) {
  const allowed = normalizeList(allowedItems);
  const requested = normalizeList(requestedItems);
  if (allowed.length === 0) {
    return requested;
  }
  if (requested.length === 0) {
    return allowed;
  }
  const allowedSet = new Set(allowed);
  return requested.filter((item) => allowedSet.has(item));
}

function hasScopeValue(scope) {
  return Object.values(scope).some((items) => Array.isArray(items) && items.length > 0);
}

export function createApiAccessManager({ logger, repositories, defaultRateLimit = 60, now = () => Date.now() } = {}) {
  const rateCounters = new Map();

  return {
    authenticate(headers = {}) {
      const apiKey = headers['x-api-key'] ?? headers['X-API-Key'];
      if (!apiKey) {
        throw new ApiAccessError('API key is required.', {
          status: 401,
          code: 'api_key_required',
        });
      }

      const client = repositories?.apiClients?.getByCredentialRef(`api-key:${apiKey}`);
      if (!client) {
        throw new ApiAccessError('API key is invalid.', {
          status: 401,
          code: 'invalid_api_key',
        });
      }

      logger?.info('api.client.authenticated', {
        client_id: client.client_id,
        tenant_id: client.tenant_id,
      });
      return client;
    },
    assertRateLimit(client) {
      const limit = client.rate_limit_policy?.query_per_minute ?? defaultRateLimit;
      const windowKey = `${client.client_id}:${Math.floor(now() / 60000)}`;
      const count = rateCounters.get(windowKey) ?? 0;
      if (count >= limit) {
        throw new ApiAccessError('Rate limit exceeded.', {
          status: 429,
          code: 'rate_limited',
        });
      }
      rateCounters.set(windowKey, count + 1);
    },
    resolveClientScope({ tenantId, allowedScope = {}, requestedScope = {} } = {}) {
      const scope = {
        tenant_id: tenantId,
        allowed_scope: {
          shelves: intersectScope(allowedScope.shelves, requestedScope.shelves),
          books: intersectScope(allowedScope.books, requestedScope.books),
          chapters: intersectScope(allowedScope.chapters, requestedScope.chapters),
          pages: intersectScope(allowedScope.pages, requestedScope.pages),
        },
      };
      if (!hasScopeValue(scope.allowed_scope)) {
        throw new ApiAccessError('Requested scope is not allowed for this client.', {
          status: 403,
          code: 'scope_not_allowed',
        });
      }
      logger?.info('api.scope.resolved', scope);
      return scope;
    },
  };
}
