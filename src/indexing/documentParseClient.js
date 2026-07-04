function withTimeout(promise, timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Document parse timed out after ${timeoutMs}ms.`)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

export function createDocumentParseClient({
  parsePdfDocument,
  maxPages = 200,
  maxFileSizeBytes = 20 * 1024 * 1024,
  timeoutMs = 30_000,
} = {}) {
  if (typeof parsePdfDocument !== 'function') {
    throw new Error('parsePdfDocument is required.');
  }

  return {
    maxPages,
    maxFileSizeBytes,
    timeoutMs,
    async parsePdf({ attachment_id, file_name, file_size_bytes, source_url } = {}) {
      if (!Number.isInteger(attachment_id)) {
        throw new Error('attachment_id must be an integer.');
      }
      if (typeof file_name !== 'string' || file_name.trim() === '') {
        throw new Error('file_name must be a non-empty string.');
      }
      if (!Number.isInteger(file_size_bytes) || file_size_bytes <= 0) {
        throw new Error('file_size_bytes must be a positive integer.');
      }
      if (file_size_bytes > maxFileSizeBytes) {
        throw new Error(`PDF exceeds file size limit: ${file_size_bytes} > ${maxFileSizeBytes}.`);
      }
      if (typeof source_url !== 'string' || source_url.trim() === '') {
        throw new Error('source_url must be a non-empty string.');
      }

      const result = await withTimeout(parsePdfDocument({ attachment_id, file_name, file_size_bytes, source_url }), timeoutMs);
      const pages = Array.isArray(result?.pages) ? result.pages : [];
      if (pages.length === 0) {
        throw new Error('Document parse result must contain at least one page.');
      }
      if (pages.length > maxPages) {
        throw new Error(`PDF exceeds page limit: ${pages.length} > ${maxPages}.`);
      }

      return {
        page_count: pages.length,
        pages: pages.map((page, index) => ({
          page_no: page.page_no ?? index + 1,
          text: page.text,
        })),
      };
    },
  };
}
