import {
  validateAiQueryLog,
  validateApiClient,
  validateEmbeddingProfile,
  validateIndexJob,
  validateKnowledgeChunk,
} from './validators.js';

class InMemoryTable {
  constructor(primaryKey, validator) {
    this.primaryKey = primaryKey;
    this.validator = validator;
    this.records = new Map();
  }

  upsert(input) {
    const record = this.validator(input);
    this.records.set(record[this.primaryKey], structuredClone(record));
    return structuredClone(record);
  }

  get(id) {
    const record = this.records.get(id);
    return record ? structuredClone(record) : null;
  }

  list(filter = () => true) {
    return [...this.records.values()].filter(filter).map((record) => structuredClone(record));
  }

  delete(id) {
    this.records.delete(id);
  }
}

export function createStorageRepositories() {
  const knowledgeChunks = new InMemoryTable('chunk_id', validateKnowledgeChunk);
  const indexJobs = new InMemoryTable('job_id', validateIndexJob);
  const aiQueryLogs = new InMemoryTable('request_id', validateAiQueryLog);
  const apiClients = new InMemoryTable('client_id', validateApiClient);
  const embeddingProfiles = new InMemoryTable('profile_id', validateEmbeddingProfile);

  return {
    knowledgeChunks: {
      upsert: (record) => knowledgeChunks.upsert(record),
      getById: (chunkId) => knowledgeChunks.get(chunkId),
      listAll() {
        return knowledgeChunks.list();
      },
      remove: (chunkId) => knowledgeChunks.delete(chunkId),
      listByPage(pageId) {
        return knowledgeChunks.list((record) => record.page_id === pageId);
      },
      listByAttachment(attachmentId) {
        return knowledgeChunks.list((record) => record.attachment_id === attachmentId);
      },
      listByTenant(tenantId) {
        return knowledgeChunks.list((record) => record.tenant_id === tenantId);
      },
      listActiveByTenantAndLanguage(tenantId, languageCode) {
        return knowledgeChunks.list((record) => record.tenant_id === tenantId && record.language_code === languageCode && record.is_active === true);
      },
    },
    indexJobs: {
      upsert: (record) => indexJobs.upsert(record),
      getById: (jobId) => indexJobs.get(jobId),
      remove: (jobId) => indexJobs.delete(jobId),
      listAll() {
        return indexJobs.list();
      },
      listByTenant(tenantId) {
        return indexJobs.list((record) => record.tenant_id === tenantId);
      },
    },
    aiQueryLogs: {
      upsert: (record) => aiQueryLogs.upsert(record),
      getById: (requestId) => aiQueryLogs.get(requestId),
      remove: (requestId) => aiQueryLogs.delete(requestId),
      listAll() {
        return aiQueryLogs.list();
      },
      listByTenant(tenantId) {
        return aiQueryLogs.list((record) => record.tenant_id === tenantId);
      },
    },
    apiClients: {
      upsert: (record) => apiClients.upsert(record),
      getById: (clientId) => apiClients.get(clientId),
      remove: (clientId) => apiClients.delete(clientId),
      getByCredentialRef(credentialRef) {
        return apiClients.list((record) => record.credential_ref === credentialRef && record.status === 'active')[0] ?? null;
      },
      listActiveByTenant(tenantId) {
        return apiClients.list((record) => record.tenant_id === tenantId && record.status === 'active');
      },
    },
    embeddingProfiles: {
      upsert: (record) => embeddingProfiles.upsert(record),
      getById: (profileId) => embeddingProfiles.get(profileId),
      remove: (profileId) => embeddingProfiles.delete(profileId),
      listActiveByLanguage(languageCode) {
        return embeddingProfiles.list((record) => record.language_code === languageCode && record.is_active === true);
      },
    },
  };
}
