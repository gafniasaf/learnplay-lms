import { supabase } from '@/integrations/supabase/client';

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
 * - Uses Supabase Storage public URL helper for the 'courses' bucket by default
 */
export function resolvePublicMediaUrl(url?: string, cacheKey?: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return appendVersion(url, cacheKey);

  const clean = String(url).replace(/^\/+/, '');
  const path = clean.startsWith('courses/') ? clean.replace(/^courses\//, '') : clean;
  try {
    const { data } = supabase.storage.from('courses').getPublicUrl(path);
    return appendVersion(data.publicUrl, cacheKey);
  } catch {
    return appendVersion(url, cacheKey);
  }
}
