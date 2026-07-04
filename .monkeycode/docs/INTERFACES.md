# 接口文档

## 模块导出

### `createAiGatewayClient(options)`

- 输入：`baseUrl`、`serviceToken`、`fetchImpl`、`defaultHeaders`
- 输出：包含 `query(payload)`、`sendIndexEvent(payload)`、`healthCheck()` 的客户端对象

### `buildQueryContext(options)`

- 支持范围：`page`、`book`、`workspace`
- 输出字段：`tenant_id`、`user_id`、`conversation_id`、`scope_mode`、`scopes`、`context_page_id`、`context_book_id`

### `createPageEventPublisher(options)`

- 支持事件：`page.created`、`page.updated`、`page.deleted`、`page.moved`
- 生成字段：`event_id`、`event_type`、`tenant_id`、`occurred_at`

### `createSidebarStateController(options)`

- 方法：`isCollapsed()`、`collapse()`、`expand()`、`toggle()`、`getConversation()`、`setConversation(nextConversation)`

### `createBookStackAiExtension(options)`

- 暴露：`sidebar`、`askQuestion()`、`askQuestionStream()`、`emitPageEvent()`、`healthCheck()`
- 作用：把 BookStack 侧边栏状态、查询上下文构造和 AI Gateway 通信聚合为一个扩展入口

### `createAiGatewayConfig(options)`

- 输入：`serviceToken`、`environment`、`modelProvider`、`embeddingModel`、`retrieval`、`limits`
- 输出：包含服务鉴权配置、模型配置、限流配置和基础指标对象的配置结果

### `createAuthContextResolver(options)`

- 输入：`serviceToken`、`logger`、`metrics`
- 输出：包含 `resolve(headers, body)` 的鉴权解析器

### `createAiGatewayApp(options)`

- 输入：`serviceToken`、`loggerSink`、`auditSink`、`repositories`、`retrieval`
- 输出：包含 `handle({ method, path, headers, body })` 的最小应用实例
- 路由：`POST /internal/ai/query`、`POST /v1/rag/query`、`POST /internal/ai/index/events`、`POST /internal/ai/audit/query`、`GET /internal/ai/observability`、`GET /internal/ai/health`

### `createRetrievalService(options)`

- 输出：包含 `buildFilter(payload)`、`retrieve(payload)` 的检索服务对象
- 用途：执行租户、权限、语言和查询范围过滤，并返回引用列表

### `createPromptOrchestrator(options)`

- 输出：包含 `compose(payload)` 的提示词编排器
- 用途：根据检索结果决定正常回答或证据不足提示

### `createInferenceAdapter(options)`

- 输出：包含 `generate(payload)`、`generateStream(payload)` 的推理适配器
- 用途：提供同步回答和 `SSE` 事件流输出

### `createApiAccessManager(options)`

- 输出：包含 `authenticate(headers)`、`assertRateLimit(client)`、`resolveClientScope(payload)` 的访问控制对象
- 用途：处理外部 `API Key` 鉴权、白名单范围收缩和限流

### `buildSchemaStatements()`

- 输出：初始化 `pgvector`、核心表结构和索引的 SQL 语句数组

### `createInitialMigration()` / `listMigrations()`

- 输出：带迁移 ID、描述和 SQL 语句列表的迁移对象

### `createStorageRepositories()`

- 输出：`knowledgeChunks`、`indexJobs`、`aiQueryLogs`、`apiClients`、`embeddingProfiles` 五组 repository 接口
- 用途：在真实数据库驱动接入前，先固定存储访问契约

### `createQueueConfig(options)`

- 输出：`streams`、`consumerGroup`、`maxRetries`、`retryScheduleMs`

### `buildIdempotencyKey(event)`

- 输入：`event_id`、`entity_id`、`version_ts`
- 输出：索引幂等键字符串

### `createIndexQueue(options)`

- 输出：包含 `enqueue(payload)`、`processNext(processor)`、`getStream(stream)` 的队列对象
- 用途：管理主流、重试流、死信流和 `index_job` 状态流转

### `normalizeBookStackContent(options)`

- 输入：`format`、`content`、`path`
- 输出：`path_text`、`headings`、`normalized_text`

### `chunkNormalizedText(options)`

- 输入：`normalizedText`、`pathText`、`maxChunkLength`、`overlap`
- 输出：包含 `chunk_index`、`content_text`、`content_hash` 的 chunk 列表

### `createManagedChineseEmbeddingProvider(options)`

- 输出：包含 `providerName`、`modelName`、`dimension`、`embed(texts)` 的 provider 对象

### `createDocumentParseClient(options)`

- 输出：包含 `parsePdf(payload)` 的文档解析客户端对象
- 约束：内建 `maxPages`、`maxFileSizeBytes`、`timeoutMs`

### `createIndexingPipeline(options)`

- 输出：包含 `indexPage(payload)`、`indexAttachment(payload)` 的内容索引流水线对象
- 用途：处理正文和 PDF 附件的标准化、chunk 生成、embedding 写入、旧版本失活和失败回写

### `createContentLifecycleManager(options)`

- 输出：包含 `deactivatePage(payload)`、`deactivateAttachment(payload)`、`shrinkPermissionScope(payload)`、`purgeTenant(payload)`、`purgeInactiveChunks(payload)`、`buildReindexPlan(payload)` 的生命周期管理对象
- 用途：处理删除传播、权限收缩、租户级清理和重建计划生成

## 内部 API 约定

### `POST /internal/ai/query`

- 由 BookStack 扩展层调用
- 请求体包含用户上下文、租户信息、范围信息和问题内容
- 当请求体包含 `stream: true` 时，返回 `text/event-stream`

### `POST /internal/ai/index/events`

- 由 BookStack 扩展层在页面事件触发时调用
- 请求体包含事件标识、事件类型、租户信息与实体信息

### `POST /v1/rag/query`

- 由外部客户端调用
- 请求头包含 `x-api-key`
- 请求体包含问题内容、可选范围和 `stream` 标记

### `POST /internal/ai/audit/query`

- 由内部服务调用
- 请求体包含 `tenant_id`，可选 `status`、`channel`、`limit`
- 返回当前租户的脱敏审计记录

### `GET /internal/ai/observability`

- 由内部服务调用
- 返回健康快照、审计记录数量和观测指标

### `GET /internal/ai/health`

- 由 BookStack 扩展层或管理端用于健康检查

## 存储结构约定

### `knowledge_chunk`

- 包含租户、层级路径、权限哈希、语言、版本时间和 `pgvector` embedding 字段

### `index_job`

- 包含实体类型、事件类型、状态、重试次数、失败原因和处理时间

### `ai_query_log`

- 包含请求编号、提问内容、命中 chunk 列表、模型信息和 token 用量

### `api_client`

- 包含凭据引用、授权范围和限流策略

### `embedding_profile`

- 包含语言代码、provider、模型名、维度和启用状态

## 队列约定

### 主流

- `index_events`

### 重试流

- `index_events_retry`

### 死信流

- `index_events_dlq`

### 状态流转

- `queued`
- `processed`
- `retry_scheduled`
- `failed`
- `duplicate_skipped`

## 内容索引约定

### 标准化输出

- `path_text`: 由层级路径拼接得到
- `headings`: 包含标题级别、文本和锚点
- `normalized_text`: 去除格式标记后的统一正文

### chunk 输出

- 每个 chunk 包含 `chunk_index`、`content_text`、`content_hash`
- `content_hash` 使用 `sha256`

### embedding 约定

- 当前默认语言为 `zh-CN`
- 当前 provider 为托管中文 embedding 服务骨架

### PDF 附件索引约定

- `source_type` 取值为 `attachment`
- `attachment_id` 记录附件来源
- `attachment_page_no` 记录 PDF 页码定位
- 解析失败时，`index_job.status` 回写为 `failed`

### 内容失效与清理约定

- 页面删除后，对应 `page_id` 的活动 chunk 失活
- 附件删除后，对应 `attachment_id` 的活动 chunk 失活
- 权限收缩后，不在允许范围内的 chunk 失活
- 租户清理时，同时删除 `knowledge_chunk`、`index_job`、`ai_query_log` 和 `api_client` 派生记录

## AI Gateway 应用返回格式

### `POST /internal/ai/query`

- 返回：`request_id`、`answer`、`citations`、`usage`

### `POST /internal/ai/query` with `stream: true`

- 事件顺序：`start`、`delta`、`citation`、`done`
- 引用字段：`chunk_id`、`source_type`、`page_id`、`attachment_id`、`attachment_page_no`、`path_text`、`snippet`

### `POST /v1/rag/query`

- 返回：`request_id`、`answer`、`citations`、`usage`
- 失败错误码：`api_key_required`、`invalid_api_key`、`scope_not_allowed`、`rate_limited`

### `POST /v1/rag/query` with `stream: true`

- 事件顺序：`start`、`delta`、`citation`、`done`

### `POST /internal/ai/audit/query`

- 返回：`entries`
- 每条记录包含脱敏后的 `question_text` 和 `answer_summary`

### `GET /internal/ai/observability`

- 返回：`health`、`audit_retained_records`

### `POST /internal/ai/index/events`

- 返回：`accepted`、`event_id`

### `GET /internal/ai/health`

- 返回：`status`、`environment`、`model_provider`、`embedding_model`、`metrics`
