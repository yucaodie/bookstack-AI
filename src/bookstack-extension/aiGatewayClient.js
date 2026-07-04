const DEFAULT_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json',
};

export class AiGatewayError extends Error {
  constructor(message, { code = 'ai_gateway_error', status = 500, details } = {}) {
    super(message);
    this.name = 'AiGatewayError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function request(fetchImpl, url, options) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch (error) {
    throw new AiGatewayError('AI Gateway network request failed.', {
      code: 'ai_gateway_network_error',
      status: 502,
      details: { cause: error.message },
    });
  }

  if (!response.ok) {
    const body = await parseJsonSafe(response);
    throw new AiGatewayError(body?.message || 'AI Gateway request failed.', {
      code: body?.code || 'ai_gateway_request_failed',
      status: response.status,
      details: body,
    });
  }

  if (response.status === 204) {
    return null;
  }

  return parseJsonSafe(response);
}

function parseSse(text) {
  return text
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      const event = lines.find((line) => line.startsWith('event: '))?.slice(7) ?? 'message';
      const dataLine = lines.find((line) => line.startsWith('data: '))?.slice(6) ?? '{}';
      return { event, data: JSON.parse(dataLine) };
    });
}

export function createAiGatewayClient({
  baseUrl,
  serviceToken,
  fetchImpl = globalThis.fetch,
  defaultHeaders = {},
} = {}) {
  if (!baseUrl) {
    throw new Error('baseUrl is required.');
  }
  if (!serviceToken) {
    throw new Error('serviceToken is required.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetchImpl must be a function.');
  }

  const headers = {
    ...DEFAULT_HEADERS,
    ...defaultHeaders,
    authorization: `Bearer ${serviceToken}`,
  };

  return {
    async query(payload) {
      return request(fetchImpl, new URL('/internal/ai/query', baseUrl), {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    },

    async queryStream(payload) {
      let response;
      try {
        response = await fetchImpl(new URL('/internal/ai/query', baseUrl), {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...payload, stream: true }),
        });
      } catch (error) {
        throw new AiGatewayError('AI Gateway network request failed.', {
          code: 'ai_gateway_network_error',
          status: 502,
          details: { cause: error.message },
        });
      }

      if (!response.ok) {
        const body = await parseJsonSafe(response);
        throw new AiGatewayError(body?.message || 'AI Gateway request failed.', {
          code: body?.code || 'ai_gateway_request_failed',
          status: response.status,
          details: body,
        });
      }

      const text = await response.text();
      return parseSse(text);
    },

    async sendIndexEvent(payload) {
      return request(fetchImpl, new URL('/internal/ai/index/events', baseUrl), {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    },

    async healthCheck() {
      return request(fetchImpl, new URL('/internal/ai/health', baseUrl), {
        method: 'GET',
        headers,
      });
    },
  };
}
