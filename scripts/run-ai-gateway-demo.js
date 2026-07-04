import http from 'node:http';

import { createAiGatewayApp } from '../src/ai-gateway/app.js';
import { createStorageRepositories } from '../src/storage/repositories.js';

const port = Number(process.env.BOOKSTACK_AI_GATEWAY_PORT || 3100);
const serviceToken = process.env.BOOKSTACK_AI_SERVICE_TOKEN || 'bookstack-dev-token';
const tenantId = process.env.BOOKSTACK_AI_TENANT_ID || 'bookstack-default';

const repositories = createStorageRepositories();

repositories.knowledgeChunks.upsert({
  chunk_id: 'chunk-page-100-home',
  tenant_id: tenantId,
  page_id: 100,
  book_id: 10,
  chapter_id: null,
  shelf_id: null,
  source_type: 'page',
  path_text: '产品手册/统一登录/总览',
  content_text: '统一登录接入推荐使用 OIDC 或 SAML。BookStack-AI 当前阶段支持页面级、书级和工作区级问答范围。',
  content_hash: 'hash-page-100-home',
  embedding_model: 'stub-embedding-zh',
  embedding: [0.12, 0.34, 0.56],
  language_code: 'zh-CN',
  permission_scope_hash: 'perm-page-100-home',
  permission_scope: {
    shelves: [],
    books: [10],
    chapters: [],
    pages: [100],
  },
  chunk_index: 0,
  version_ts: '2026-07-04T00:00:00.000Z',
  is_active: true,
});

repositories.knowledgeChunks.upsert({
  chunk_id: 'chunk-book-10-overview',
  tenant_id: tenantId,
  page_id: 101,
  book_id: 10,
  chapter_id: null,
  shelf_id: null,
  source_type: 'page',
  path_text: '产品手册/统一登录/实施步骤',
  content_text: '实施步骤包括配置身份提供方、回调地址、服务端签名校验和用户属性映射。引用会返回到对应页面。',
  content_hash: 'hash-book-10-overview',
  embedding_model: 'stub-embedding-zh',
  embedding: [0.21, 0.43, 0.65],
  language_code: 'zh-CN',
  permission_scope_hash: 'perm-book-10-overview',
  permission_scope: {
    shelves: [],
    books: [10],
    chapters: [],
    pages: [101],
  },
  chunk_index: 1,
  version_ts: '2026-07-04T00:00:00.000Z',
  is_active: true,
});

const app = createAiGatewayApp({
  serviceToken,
  repositories,
  retrieval: { topK: 5 },
});

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

const server = http.createServer(async (request, response) => {
  const body = request.method === 'GET' ? {} : await readBody(request).catch(() => null);
  if (body === null) {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: 'invalid_json', message: 'Request body must be valid JSON.' }));
    return;
  }

  const result = await app.handle({
    method: request.method,
    path: request.url,
    headers: request.headers,
    body,
  });

  response.writeHead(result.status, result.headers);
  response.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`BookStack AI Gateway demo listening on http://0.0.0.0:${port}`);
});
