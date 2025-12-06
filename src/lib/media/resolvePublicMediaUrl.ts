/**
 * Media URL resolution - IgniteZero compliant
 * Constructs public URLs without direct Supabase storage calls
 */

import { getSupabaseUrl } from '@/lib/api/common';

/**
 * Append a cache-busting version param to a URL
 */
export function appendVersion(u: string, v?: string) {
  if (!v) return u;
  try {
    const o = new URL(u);
    o.searchParams.set('v', v);
    return o.toString();
  } catch {
    return u + (u.includes('?') ? `&v=${encodeURIComponent(v)}` : `?v=${encodeURIComponent(v)}`);
  }
}

/**
 * Resolve a possibly storage-relative media URL to a public, absolute URL.
 * - Accepts absolute (http/https/data) and relative storage paths (e.g. courses/abc/img.png)
 * - Constructs public URL for 'courses' bucket without API calls
 */
export function resolvePublicMediaUrl(url?: string, cacheKey?: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return appendVersion(url, cacheKey);

  const clean = String(url).replace(/^\/+/, '');
  const path = clean.startsWith('courses/') ? clean.replace(/^courses\//, '') : clean;
  
  // Construct public URL directly without Supabase client
  const supabaseUrl = getSupabaseUrl();
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/courses/${path}`;
  
  return appendVersion(publicUrl, cacheKey);
}
