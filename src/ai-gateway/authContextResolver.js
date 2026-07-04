export class AuthError extends Error {
  constructor(message, { status = 401, code = 'unauthorized' } = {}) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
  }
}

function extractBearerToken(headers) {
  const value = headers?.authorization || headers?.Authorization;
  if (!value) {
    return null;
  }
  const [scheme, token] = value.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : null;
}

export function createAuthContextResolver({ serviceToken, logger, metrics } = {}) {
  if (!serviceToken) {
    throw new Error('serviceToken is required.');
  }

  return {
    resolve(headers = {}, body = {}) {
      const token = extractBearerToken(headers);
      if (!token || token !== serviceToken) {
        if (metrics) {
          metrics.authFailures += 1;
        }
        logger?.warn('auth.failed', { hasToken: Boolean(token) });
        throw new AuthError('Invalid service token.', {
          status: 401,
          code: 'invalid_service_token',
        });
      }

      const context = {
        tenantId: body.tenant_id ?? null,
        userId: body.user_id ?? null,
        scopeMode: body.scope_mode ?? null,
        scopes: body.scopes ?? null,
      };
      logger?.info('auth.resolved', context);
      return context;
    },
  };
}
