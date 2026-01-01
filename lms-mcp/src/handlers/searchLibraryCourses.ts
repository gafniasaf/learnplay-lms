import { config } from '../config.js';
import { fetchJson } from '../http.js';

export interface SearchLibraryCoursesInput {
  query: string;
  limit?: number;
  format?: string; // e.g. "mes" | "library" | "all"
}

export async function searchLibraryCourses({ params }: { params: SearchLibraryCoursesInput }) {
  const query = String(params?.query ?? '').trim();
  if (!query) {
    throw new Error('query is required');
  }

  const limit = Math.min(50, Math.max(1, Math.floor(Number(params?.limit ?? 20))));
  const format = String(params?.format ?? 'mes').trim() || 'mes';

  const qs = new URLSearchParams();
  qs.set('query', query);
  qs.set('limit', String(limit));
  qs.set('format', format);

  const url = `${config.supabaseUrl}/functions/v1/search-courses?${qs.toString()}`;
  const res = await fetchJson(url, {
    method: 'GET',
    headers: {
      'X-Agent-Token': config.agentToken,
      ...(config.organizationId ? { 'X-Organization-Id': config.organizationId } : {}),
      'Content-Type': 'application/json',
    },
    timeoutMs: 30000,
  });
  if (!res.ok) {
    throw new Error(`search-courses failed (${res.status}): ${res.json?.error || res.text}`);
  }
  return res.json;
}



