const htmlFenceRegex = /[ \t]*```(?:html)?\s*([\s\S]*?)```/gi;
const fullHtmlRegex = /<!DOCTYPE\s+html[\s\S]*?<\/html>|<html[\s\S]*?<\/html>/gi;

const inlineBlockRegex =
  /<(?:section|div|main|body|header|footer|article|table)[\s\S]+?<\/(?:section|div|main|body|header|footer|article|table)>/gi;

function pickBestCandidate(candidates: string[]): string | null {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => b.length - a.length)[0]?.trim() || null;
}

function sanitizeCandidate(candidate?: string | null): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  if (/<(html|section|div|main|header|body|footer|article|table)/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export function extractAllHtmlSnippets(source: string): string[] {
  if (!source) return [];
  const candidates: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  htmlFenceRegex.lastIndex = 0;
  while ((match = htmlFenceRegex.exec(source)) !== null) {
    const candidate = sanitizeCandidate(match[1]);
    if (candidate && !seen.has(candidate)) {
      candidates.push(candidate);
      seen.add(candidate);
    }
  }

  fullHtmlRegex.lastIndex = 0;
  while ((match = fullHtmlRegex.exec(source)) !== null) {
    const candidate = sanitizeCandidate(match[0]);
    if (candidate && !seen.has(candidate)) {
      candidates.push(candidate);
      seen.add(candidate);
    }
  }

  return candidates;
}

export function extractHtmlSnippet(source: string): string | null {
  return pickBestCandidate(extractAllHtmlSnippets(source));
}

export function extractPageTitle(html: string): string | null {
  if (!html) return null;
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    return titleMatch[1].trim();
  }
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (h1Match && h1Match[1]) {
    return h1Match[1].replace(/<[^>]+>/g, '').trim();
  }
  return null;
}

