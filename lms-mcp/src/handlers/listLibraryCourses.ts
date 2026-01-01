import { config } from '../config.js';
import { fetchJson } from '../http.js';

export interface ListLibraryCoursesInput {
  page?: number;
  limit?: number;
  search?: string;
  /** Envelope format stored in course.json, also mirrored to course_metadata.tags.__format */
  format?: string; // e.g. "mes" | "library" | "all"
}

export async function listLibraryCourses({ params }: { params: ListLibraryCoursesInput }) {
  if (!config.organizationId) {
    throw new Error('❌ BLOCKED: ORGANIZATION_ID is REQUIRED for listLibraryCourses');
  }

  const page = Math.max(1, Math.floor(Number(params?.page ?? 1)));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(params?.limit ?? 20))));
  const search = String(params?.search ?? '').trim();
  const format = String(params?.format ?? 'mes').trim() || 'mes';

  const qs = new URLSearchParams();
  qs.set('page', String(page));
  qs.set('limit', String(limit));
  qs.set('sort', 'newest');
  qs.set('format', format);
  if (search) qs.set('search', search);

  const url = `${config.supabaseUrl}/functions/v1/list-courses?${qs.toString()}`;
  const res = await fetchJson(url, {
    method: 'GET',
    headers: {
      'X-Agent-Token': config.agentToken,
      'X-Organization-Id': config.organizationId,
      'Content-Type': 'application/json',
    },
    timeoutMs: 30000,
  });
  if (!res.ok) {
    throw new Error(`list-courses failed (${res.status}): ${res.json?.error || res.text}`);
  }
  return res.json;
}



