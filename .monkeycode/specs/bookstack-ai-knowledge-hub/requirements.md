# Requirements Document

## Introduction

BookStack-AI 是基于 BookStack 的企业级智能知识中枢。系统在保留 BookStack 原有的书架、书籍、章节、页面层级模型、多用户权限体系，以及 WYSIWYG/Markdown 双编辑能力的前提下，新增独立 AI 服务集成能力，为企业提供站内智能问答和可对外开放的 RAG API。

## Glossary

- **BookStack Core**: 原始 BookStack 应用，负责内容管理、权限控制、编辑与阅读。
- **AI Gateway**: 与 BookStack 解耦的独立 AI 接入层，负责检索、编排、模型调用和 API 暴露。
- **Knowledge Index**: 从 BookStack 页面内容抽取并切片后生成的向量化知识索引。
- **RAG API**: 面向外部系统开放的检索增强生成接口。
- **Workspace**: 由租户、空间或组织边界定义的知识访问范围。

## Requirements

### Requirement 1

**User Story:** AS 知识库管理员, I want 保留 BookStack 原有内容组织和权限模型, so that 团队可以在低迁移成本下接入智能能力。

#### Acceptance Criteria

1. The BookStack-AI system SHALL retain the BookStack shelf-book-chapter-page hierarchy as the primary content organization model.
2. The BookStack-AI system SHALL retain the BookStack user, role, and permission model as the primary authorization source.
3. WHEN users create or edit pages, the BookStack-AI system SHALL preserve both WYSIWYG and Markdown editing modes.
4. WHEN AI capabilities are unavailable, the BookStack-AI system SHALL continue to provide core content browsing and editing through BookStack Core.

### Requirement 2

**User Story:** AS 知识库使用者, I want 在知识库内进行智能问答, so that 我可以快速获得基于企业知识的可信答案。

#### Acceptance Criteria

1. WHEN an authenticated user submits a question, the BookStack-AI system SHALL retrieve knowledge only from pages that the authenticated user can access.
2. WHEN the BookStack-AI system returns an answer, the BookStack-AI system SHALL provide source references at page or section granularity.
3. IF the BookStack-AI system finds insufficient evidence, the BookStack-AI system SHALL return an evidence-insufficient response with retrieved references.
4. WHILE an answer is being generated, the BookStack-AI system SHALL preserve the full question, retrieval, and response trace for auditing.

### Requirement 3

**User Story:** AS 平台管理员, I want 知识内容自动进入索引, so that AI 问答结果可以跟随文档变化及时更新。

#### Acceptance Criteria

1. WHEN a page is created, updated, moved, or deleted, the BookStack-AI system SHALL trigger an indexing workflow for the affected knowledge scope.
2. The BookStack-AI system SHALL transform page content into normalized text before chunking and embedding.
3. The BookStack-AI system SHALL persist chunk metadata that includes source page, hierarchy path, tenant boundary, permission scope, version timestamp, and language.
4. IF an indexing task fails, the BookStack-AI system SHALL record the failure reason and expose retry capability to administrators.

### Requirement 4

**User Story:** AS 外部业务系统, I want 调用统一的 RAG API, so that 我可以复用企业知识问答能力。

#### Acceptance Criteria

1. WHEN an external client calls the RAG API with valid credentials, the BookStack-AI system SHALL authenticate the client and resolve the allowed knowledge scope.
2. The BookStack-AI system SHALL expose at least query, retrieve, and health-check API capabilities.
3. WHEN the RAG API returns an answer, the BookStack-AI system SHALL include answer text, citations, request identifier, and model usage metadata.
4. IF a client exceeds rate or quota limits, the BookStack-AI system SHALL return a throttling response with a machine-readable error code.

### Requirement 5

**User Story:** AS 安全管理员, I want AI 服务与核心知识库解耦, so that 安全边界、扩展性和运维能力更清晰。

#### Acceptance Criteria

1. The BookStack-AI system SHALL run AI orchestration outside the BookStack Core deployment unit.
2. WHEN BookStack Core invokes AI capabilities, the BookStack-AI system SHALL use authenticated service-to-service communication.
3. The BookStack-AI system SHALL avoid direct model-provider credentials exposure in BookStack Core user-facing code paths.
4. WHEN audit logs are generated, the BookStack-AI system SHALL separate end-user content operations from AI inference operations.

### Requirement 6

**User Story:** AS 运维负责人, I want 系统具备可观测性和可治理性, so that 我可以稳定运行和持续优化 AI 能力。

#### Acceptance Criteria

1. The BookStack-AI system SHALL expose structured logs, request metrics, indexing metrics, and model call metrics.
2. WHEN administrators inspect AI traffic, the BookStack-AI system SHALL provide query history, failure reason, latency, and token usage records.
3. IF a downstream model or vector service degrades, the BookStack-AI system SHALL surface health degradation through monitoring endpoints and alertable metrics.
4. The BookStack-AI system SHALL support configuration of model provider, embedding model, retrieval parameters, and rate limits by environment.

### Requirement 7

**User Story:** AS 企业客户, I want 系统满足多租户和合规要求, so that 不同组织可以安全共享同一平台能力。

#### Acceptance Criteria

1. The BookStack-AI system SHALL isolate tenant data in content indexing, vector retrieval, audit records, and API credentials.
2. WHEN the BookStack-AI system processes a query, the BookStack-AI system SHALL enforce tenant boundary before retrieval and answer generation.
3. The BookStack-AI system SHALL support configurable retention policies for AI audit records and indexing artifacts.
4. IF a tenant requests content purge, the BookStack-AI system SHALL propagate purge operations to retrieval indexes and derived artifacts.
