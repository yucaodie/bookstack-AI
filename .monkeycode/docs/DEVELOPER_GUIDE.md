# 开发者指南

## 本地命令

```bash
# 运行测试
npm test
```

## 当前技术约定

- 当前代码使用原生 ESM。
- 测试框架使用 Node 内建 `node:test`。
- 当前阶段已实现扩展层、AI Gateway、核心存储层、索引任务队列、内容索引流水线、PDF 附件索引、站内检索与 `SSE` 流式回答、外部 `RAG API` 的 `API Key` 治理、内部审计与观测，以及内容生命周期管理骨架。

## 后续开发顺序

1. 执行最终检查点并确认外部 API、审计治理和合规清理主路径可运行。

## 扩展建议

- 新增扩展层能力时，优先通过 `createBookStackAiExtension` 聚合，避免在入口层直接散落调用。
- 新增内部 API 时，优先在 `aiGatewayClient.js` 中集中封装错误映射。
- 新增范围模式或页面事件时，先扩展 `queryScope.js` 和 `pageEvents.js`，再补对应测试。
- 新增 AI Gateway 内部能力时，优先通过 `createAiGatewayApp` 聚合路由和模块依赖，避免在路由层直接写业务分支。
- 新增真实数据库适配时，优先保持 `createStorageRepositories` 的接口不变，仅替换内存实现为 PostgreSQL 驱动实现。
- 新增真实 Redis Streams 适配时，优先保持 `createIndexQueue` 的接口不变，仅替换 `memoryStreamClient` 为真实客户端。
- 新增正文或附件索引能力时，优先复用 `createIndexingPipeline`，保持 chunk、embedding 和版本失活逻辑集中管理。
- 接入真实 PDF 解析服务时，优先复用 `createDocumentParseClient` 的页数、体积和超时约束，并将失败信息统一回写到 `index_job`。
- 扩展站内回答链路时，优先复用 `createRetrievalService`、`createPromptOrchestrator` 和 `createInferenceAdapter`，保持同步与流式输出共享同一套检索和引用逻辑。
- 扩展外部 `RAG API` 时，优先复用 `createApiAccessManager` 的鉴权、白名单和限流逻辑，并把请求审计写入 `ai_query_log`。
- 扩展审计与观测能力时，优先复用 `createAuditLogger` 的脱敏与保留期逻辑，并通过 `healthService` 统一输出依赖状态和指标。
- 扩展删除传播与清理能力时，优先复用 `createContentLifecycleManager`，保持失活、租户清理和重建计划逻辑集中管理。
