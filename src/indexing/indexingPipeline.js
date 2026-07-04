import { createHash, randomUUID } from 'node:crypto';

import { normalizeBookStackContent } from './normalizer.js';
import { chunkNormalizedText } from './chunker.js';

function makePermissionScopeHash(scope) {
  return createHash('sha256').update(JSON.stringify(scope)).digest('hex');
}

export function createIndexingPipeline({ repositories, embeddingProvider, now = () => new Date().toISOString() } = {}) {
  if (!repositories?.knowledgeChunks || !repositories?.embeddingProfiles) {
    throw new Error('repositories with knowledgeChunks and embeddingProfiles are required.');
  }
  if (!embeddingProvider?.embed) {
    throw new Error('embeddingProvider.embed is required.');
  }

  function upsertEmbeddingProfile(languageCode) {
    repositories.embeddingProfiles.upsert({
      profile_id: `${languageCode}:${embeddingProvider.modelName}`,
      language_code: languageCode,
      embedding_provider: embeddingProvider.providerName,
      embedding_model: embeddingProvider.modelName,
      dimension: embeddingProvider.dimension,
      is_active: true,
    });
  }

  function deactivatePrevious(records, versionTs) {
    for (const record of records) {
      if (record.version_ts !== versionTs) {
        repositories.knowledgeChunks.upsert({ ...record, is_active: false });
      }
    }
  }

  async function writeChunks({
    chunks,
    tenant_id,
    page_id = null,
    attachment_id = null,
    attachment_page_no = null,
    book_id,
    chapter_id,
    shelf_id,
    language_code,
    permission_scope,
    version_ts,
    source_type,
  }) {
    const vectors = await embeddingProvider.embed(chunks.map((chunk) => chunk.content_text));
    const permission_scope_hash = makePermissionScopeHash(permission_scope ?? {});

    return chunks.map((chunk, index) => repositories.knowledgeChunks.upsert({
      chunk_id: `${source_type}:${page_id ?? attachment_id}:${version_ts}:${index}:${randomUUID()}`,
      tenant_id,
      page_id,
      attachment_id,
      attachment_page_no: chunk.attachment_page_no ?? attachment_page_no,
      book_id,
      chapter_id,
      shelf_id,
      source_type,
      path_text: chunk.path_text,
      content_text: chunk.content_text,
      content_hash: chunk.content_hash,
      chunk_index: chunk.chunk_index,
      embedding_model: embeddingProvider.modelName,
      language_code,
      embedding: vectors[index],
      permission_scope_hash,
      permission_scope,
      version_ts,
      is_active: true,
    }));
  }

  return {
    async indexPage({
      tenant_id,
      page_id,
      book_id,
      chapter_id,
      shelf_id,
      path,
      format,
      content,
      language_code = 'zh-CN',
      permission_scope,
      version_ts = now(),
    } = {}) {
      const normalized = normalizeBookStackContent({ format, content, path });
      const chunks = chunkNormalizedText({
        normalizedText: normalized.normalized_text,
        pathText: normalized.path_text,
      });
      upsertEmbeddingProfile(language_code);

      const previous = repositories.knowledgeChunks.listByPage(page_id);
      deactivatePrevious(previous, version_ts);

      return writeChunks({
        chunks,
        tenant_id,
        page_id,
        book_id,
        chapter_id,
        shelf_id,
        language_code,
        permission_scope,
        version_ts,
        source_type: 'page',
      });
    },
    async indexAttachment({
      job_id,
      tenant_id,
      attachment_id,
      page_id,
      book_id,
      chapter_id,
      shelf_id,
      path,
      file_name,
      file_size_bytes,
      source_url,
      permission_scope,
      language_code = 'zh-CN',
      version_ts = now(),
      documentParseClient,
    } = {}) {
      if (!documentParseClient?.parsePdf) {
        throw new Error('documentParseClient.parsePdf is required.');
      }

      const queuedAt = now();
      if (job_id) {
        repositories.indexJobs.upsert({
          job_id,
          tenant_id,
          entity_type: 'attachment',
          entity_id: String(attachment_id),
          event_type: 'attachment.indexed',
          status: 'processing',
          queued_at: queuedAt,
        });
      }

      try {
        const parsed = await documentParseClient.parsePdf({
          attachment_id,
          file_name,
          file_size_bytes,
          source_url,
        });
        upsertEmbeddingProfile(language_code);
        const previous = repositories.knowledgeChunks.listByAttachment(attachment_id);
        deactivatePrevious(previous, version_ts);

        const records = [];
        for (const page of parsed.pages) {
          const normalized = normalizeBookStackContent({
            format: 'text',
            content: page.text,
            path: [...(path ?? []), `${file_name}#page-${page.page_no}`],
          });
          const chunks = chunkNormalizedText({
            normalizedText: normalized.normalized_text,
            pathText: normalized.path_text,
          }).map((chunk) => ({ ...chunk, attachment_page_no: page.page_no }));
          const pageRecords = await writeChunks({
            chunks,
            tenant_id,
            page_id,
            attachment_id,
            book_id,
            chapter_id,
            shelf_id,
            language_code,
            permission_scope,
            version_ts,
            source_type: 'attachment',
          });
          records.push(...pageRecords);
        }

        if (job_id) {
          repositories.indexJobs.upsert({
            job_id,
            tenant_id,
            entity_type: 'attachment',
            entity_id: String(attachment_id),
            event_type: 'attachment.indexed',
            status: 'processed',
            queued_at: queuedAt,
            processed_at: now(),
          });
        }

        return {
          page_count: parsed.page_count,
          records,
        };
      } catch (error) {
        if (job_id) {
          repositories.indexJobs.upsert({
            job_id,
            tenant_id,
            entity_type: 'attachment',
            entity_id: String(attachment_id),
            event_type: 'attachment.indexed',
            status: 'failed',
            queued_at: queuedAt,
            processed_at: now(),
            failure_reason: error.message,
          });
        }
        throw error;
      }
    },
  };
}
