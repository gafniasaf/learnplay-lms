import { useEffect } from 'react';
import type { Course } from '@/lib/types/course';
import { resolvePublicMediaUrl } from '@/lib/media/resolvePublicMediaUrl';
import { getOptimizedImageUrl } from '@/lib/utils/imageOptimizer';
import { getViewport, getOptionImageTargetWidth, getImageSizing } from '@/lib/utils/mediaSizing';

type PreloadListener = (loaded: number, total: number) => void;

type PreloadEntry = {
  total: number;
  loaded: number;
  urls: string[];
  urlSet: Set<string>;
  done: Set<string>;
  listeners: Set<PreloadListener>;
  running: boolean;
};

// Track preloads across component mounts for the same course/version.
// IMPORTANT: This must handle React StrictMode (effects mount/unmount/mount),
// otherwise preloading can start in the first mount and the progress UI will
// never receive updates in the second mount.
const preloadCache = new Map<string, PreloadEntry>();

// Identify if a string looks like an image URL or storage path
function isImageLike(u?: string): boolean {
  if (!u) return false;
  const low = u.toLowerCase();
  return /(\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg)(\?|$)/.test(low) || /^https?:\/\//.test(low);
}

type PreloadTarget = { url: string; kind: 'stem' | 'option' | 'studyText' };

function collectImageTargets(course: Course): PreloadTarget[] {
  const targets: PreloadTarget[] = [];

  // Collect all items - from root level AND from groups
  const allItems: any[] = [];
  
  // Root-level items
  if (Array.isArray((course as any).items)) {
    allItems.push(...(course as any).items);
  }
  
  // Items nested in groups
  if (Array.isArray((course as any).groups)) {
    for (const group of (course as any).groups) {
      if (Array.isArray(group?.items)) {
        allItems.push(...group.items);
      }
    }
  }

  for (const item of allItems) {
    if (!item) continue;
    
    // Stem/stimulus image
    const stim: any = item.stimulus;
    if (stim?.type === 'image' && stim.url) {
      targets.push({ url: stim.url, kind: 'stem' });
    }

    // Newer schema stem media array
    const stemMedia = item?.stem?.media as Array<any> | undefined;
    if (Array.isArray(stemMedia)) {
      for (const m of stemMedia) {
        if (m?.type === 'image' && m.url) targets.push({ url: m.url, kind: 'stem' });
      }
    }

    // Option media array
    if (Array.isArray(item.optionMedia)) {
      for (const m of item.optionMedia) {
        if (m && (m as any).type === 'image' && (m as any).url) {
          targets.push({ url: (m as any).url, kind: 'option' });
        }
      }
    }

    // Visual MCQ: options are image URLs
    if (item.mode === 'visual-mcq' && Array.isArray(item.options)) {
      for (const opt of item.options) {
        if (typeof opt === 'string' && isImageLike(opt)) targets.push({ url: opt, kind: 'option' });
      }
    }

    // Diagram labeling: diagram image
    if (item.mode === 'diagram-label' && typeof item.diagramUrl === 'string') {
      if (isImageLike(item.diagramUrl)) targets.push({ url: item.diagramUrl, kind: 'stem' });
    }
    
    // Reference images (explain/reference field might have image URLs)
    const refHtml = item.reference?.html || item.referenceHtml || item.explain || '';
    if (typeof refHtml === 'string') {
      // Extract image URLs from HTML img tags
      const imgMatches = refHtml.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
      for (const match of imgMatches) {
        if (match[1] && isImageLike(match[1])) {
          targets.push({ url: match[1], kind: 'stem' });
        }
      }
    }
  }

  // Study text images - extract from [IMAGE:...] markers
  if (Array.isArray((course as any).studyTexts)) {
    for (const st of (course as any).studyTexts) {
      if (!st?.content || typeof st.content !== 'string') continue;
      
      const imageMarkerRegex = /\[IMAGE:(https?:\/\/[^\]]+)\]/gi;
      const matches = st.content.matchAll(imageMarkerRegex);
      for (const match of matches) {
        if (match[1]) {
          targets.push({ url: match[1], kind: 'studyText' });
        }
      }
    }
  }

  // De-duplicate by URL string
  const seen = new Set<string>();
  const deduped: PreloadTarget[] = [];
  for (const t of targets) {
    if (!t.url) continue;
    if (seen.has(t.url)) continue;
    seen.add(t.url);
    deduped.push(t);
  }
  return deduped;
}

async function preloadImage(url: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      img.onload = null;
      img.onerror = null;
      // @ts-ignore - onabort exists on HTMLImageElement in browsers
      img.onabort = null;
      clearTimeout(timer);
      resolve();
    };

    const timer = window.setTimeout(finish, timeoutMs);
    img.onload = finish;
    img.onerror = finish;
    // @ts-ignore - onabort exists on HTMLImageElement in browsers
    img.onabort = finish;
    img.decoding = 'async';
    img.loading = 'eager';
    img.src = url;

    // Some browsers may not reliably fire onload for cached resources; handle that.
    if (img.complete) {
      queueMicrotask(finish);
    }
  });
}

function ensureEntry(versionKey: string): PreloadEntry {
  const existing = preloadCache.get(versionKey);
  if (existing && (existing as any).listeners && (existing as any).done && (existing as any).urlSet) {
    return existing;
  }

  const entry: PreloadEntry = {
    total: 0,
    loaded: 0,
    urls: [],
    urlSet: new Set<string>(),
    done: new Set<string>(),
    listeners: new Set<PreloadListener>(),
    running: false,
  };
  preloadCache.set(versionKey, entry);
  return entry;
}

function notify(entry: PreloadEntry) {
  entry.loaded = entry.done.size;
  entry.total = entry.urls.length;
  for (const cb of entry.listeners) {
    try {
      cb(entry.loaded, entry.total);
    } catch {
      // ignore listener failures
    }
  }
}

async function runPreload(entry: PreloadEntry) {
  if (entry.running) return;
  if (entry.urls.length === 0) return;

  entry.running = true;
  try {
    const CONCURRENCY = 4;
    let idx = 0;

    const runNext = async (): Promise<void> => {
      while (true) {
        const i = idx++;
        if (i >= entry.urls.length) return;
        const url = entry.urls[i];
        if (!url || entry.done.has(url)) continue;
        await preloadImage(url);
        entry.done.add(url);
        notify(entry);
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, entry.urls.length) }, () => runNext());
    await Promise.all(workers);
  } finally {
    entry.running = false;
    // If more URLs were added while we were running, start again.
    if (entry.done.size < entry.urls.length) {
      // fire-and-forget
      void runPreload(entry);
    }
  }
}

/**
 * Preload all course images in the background once the course is available.
 * - Respects Data Saver and very slow connections.
 * - Limits concurrency to avoid jank.
 */
export function useCoursePreloader(
  course: Course | null | undefined,
  opts?: { onProgress?: (loaded: number, total: number) => void }
) {
  useEffect(() => {
    if (!course?.id) return;
    
    // Check if we have any content to preload
    const hasItems = Array.isArray((course as any).items) && (course as any).items.length > 0;
    const hasGroups = Array.isArray((course as any).groups) && (course as any).groups.some((g: any) => Array.isArray(g?.items) && g.items.length > 0);
    const hasStudyTexts = Array.isArray((course as any).studyTexts) && (course as any).studyTexts.length > 0;
    
    if (!hasItems && !hasGroups && !hasStudyTexts) {
      // No content to preload - report 0/0 immediately
      opts?.onProgress?.(0, 0);
      return;
    }

    // Only run once per course version across the app session
    const versionKey = `${course.id}:${(course as any).contentVersion ?? 'nov'}`;
    const entry = ensureEntry(versionKey);

    // Network conditions: respect Data Saver and 2g
    const conn: any = (navigator as any)?.connection;
    const saveData = !!conn?.saveData;
    const eff = String(conn?.effectiveType || '');
    if (saveData || /(^|-)2g$/.test(eff)) {
      // Skip aggressive preloading on constrained networks
      // Still notify through the shared entry so any listeners get consistent state.
      entry.urls = [];
      entry.urlSet.clear();
      entry.done.clear();
      notify(entry);
      return;
    }

    const viewport = getViewport();
    const stemWidth = getImageSizing('stem', viewport as any).maxWidth;
    const optionWidth = getOptionImageTargetWidth(viewport as any);

    const rawTargets = collectImageTargets(course);
    const targets = rawTargets.map((t) => {
      const abs = resolvePublicMediaUrl(t.url, (course as any).contentVersion);
      const width = t.kind === 'stem' || t.kind === 'studyText' ? stemWidth : optionWidth;
      const optimized = getOptimizedImageUrl(abs, { width, quality: t.kind === 'option' ? 80 : 85 });
      return optimized;
    });

    // Merge targets into the shared entry (deduped) so multiple mounts keep consistent progress.
    for (const url of targets) {
      if (!url) continue;
      if (entry.urlSet.has(url)) continue;
      entry.urlSet.add(url);
      entry.urls.push(url);
    }

    // Subscribe to progress updates.
    const listener: PreloadListener = (l, t) => {
      opts?.onProgress?.(l, t);
    };
    entry.listeners.add(listener);

    // Report initial state (cached/in-flight).
    notify(entry);

    // Start or continue preloading.
    void runPreload(entry);

    return () => {
      entry.listeners.delete(listener);
    };
  }, [course?.id, (course as any)?.contentVersion, opts?.onProgress]);
}
