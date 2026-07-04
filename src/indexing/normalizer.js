function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function normalizeWhitespace(text) {
  return text
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractHtmlHeadings(html) {
  const headings = [];
  const headingRegex = /<h([1-6])(?:\s+[^>]*)?>(.*?)<\/h\1>/gis;
  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    const level = Number(match[1]);
    const text = normalizeWhitespace(decodeHtmlEntities(match[2].replace(/<[^>]+>/g, ' ')));
    if (!text) {
      continue;
    }
    headings.push({ level, text, anchor: slugify(text) });
  }
  return headings;
}

function normalizeHtmlBody(html) {
  return normalizeWhitespace(
    decodeHtmlEntities(
      html
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, ' '),
    ),
  );
}

function extractMarkdownHeadings(markdown) {
  const headings = [];
  for (const line of markdown.split('\n')) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (!match) {
      continue;
    }
    const level = match[1].length;
    const text = normalizeWhitespace(match[2]);
    headings.push({ level, text, anchor: slugify(text) });
  }
  return headings;
}

function normalizeMarkdownBody(markdown) {
  return normalizeWhitespace(
    markdown
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^>\s?/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, ''),
  );
}

export function normalizeBookStackContent({ format, content, path = [] } = {}) {
  if (!content || typeof content !== 'string') {
    throw new Error('content must be a non-empty string.');
  }

  const pathText = path.filter(Boolean).join('/');
  if (format === 'html') {
    return {
      format,
      path_text: pathText,
      headings: extractHtmlHeadings(content),
      normalized_text: normalizeHtmlBody(content),
    };
  }

  if (format === 'markdown') {
    return {
      format,
      path_text: pathText,
      headings: extractMarkdownHeadings(content),
      normalized_text: normalizeMarkdownBody(content),
    };
  }

  if (format === 'text') {
    return {
      format,
      path_text: pathText,
      headings: [],
      normalized_text: normalizeWhitespace(content),
    };
  }

  throw new Error(`Unsupported format: ${format}`);
}
