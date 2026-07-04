function deactivateRecords(records, repositories) {
  let affected = 0;
  for (const record of records) {
    if (record.is_active === true) {
      repositories.knowledgeChunks.upsert({ ...record, is_active: false });
      affected += 1;
    }
  }
  return affected;
}

function removeRecords(records, remove) {
  let removed = 0;
  for (const record of records) {
    remove(record);
    removed += 1;
  }
  return removed;
}

export function createContentLifecycleManager({ repositories } = {}) {
  if (!repositories?.knowledgeChunks || !repositories?.indexJobs || !repositories?.aiQueryLogs) {
    throw new Error('repositories with knowledgeChunks, indexJobs and aiQueryLogs are required.');
  }

  return {
    deactivatePage({ pageId } = {}) {
      return deactivateRecords(repositories.knowledgeChunks.listByPage(pageId), repositories);
    },
    deactivateAttachment({ attachmentId } = {}) {
      return deactivateRecords(repositories.knowledgeChunks.listByAttachment(attachmentId), repositories);
    },
    shrinkPermissionScope({ tenantId, allowedPages = [], allowedBooks = [] } = {}) {
      const pages = new Set(allowedPages);
      const books = new Set(allowedBooks);
      return deactivateRecords(
        repositories.knowledgeChunks.listByTenant(tenantId).filter((record) => {
          const pageVisible = pages.size === 0 || pages.has(record.page_id);
          const bookVisible = books.size === 0 || books.has(record.book_id);
          return !(pageVisible && bookVisible);
        }),
        repositories,
      );
    },
    purgeTenant({ tenantId } = {}) {
      const removedChunks = removeRecords(
        repositories.knowledgeChunks.listByTenant(tenantId),
        (record) => repositories.knowledgeChunks.remove(record.chunk_id),
      );
      const removedJobs = removeRecords(
        repositories.indexJobs.listByTenant(tenantId),
        (record) => repositories.indexJobs.remove(record.job_id),
      );
      const removedLogs = removeRecords(
        repositories.aiQueryLogs.listByTenant(tenantId),
        (record) => repositories.aiQueryLogs.remove(record.request_id),
      );
      const removedClients = removeRecords(
        repositories.apiClients.listActiveByTenant(tenantId),
        (record) => repositories.apiClients.remove(record.client_id),
      );

      return {
        removed_chunks: removedChunks,
        removed_jobs: removedJobs,
        removed_logs: removedLogs,
        removed_clients: removedClients,
      };
    },
    purgeInactiveChunks({ tenantId } = {}) {
      const removed = removeRecords(
        repositories.knowledgeChunks.listByTenant(tenantId).filter((record) => record.is_active === false),
        (record) => repositories.knowledgeChunks.remove(record.chunk_id),
      );
      return removed;
    },
    buildReindexPlan({ tenantId } = {}) {
      const active = repositories.knowledgeChunks.listByTenant(tenantId).filter((record) => record.is_active === true);
      const pages = [...new Set(active.filter((record) => record.page_id !== null).map((record) => record.page_id))];
      const attachments = [...new Set(active.filter((record) => record.attachment_id !== null).map((record) => record.attachment_id))];
      return {
        tenant_id: tenantId,
        page_ids: pages,
        attachment_ids: attachments,
      };
    },
  };
}
