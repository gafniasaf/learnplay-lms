import { useEffect } from 'react';
import type { Course } from '@/lib/types/course';
import { resolvePublicMediaUrl } from '@/lib/media/resolvePublicMediaUrl';
import { getOptimizedImageUrl } from '@/lib/utils/imageOptimizer';
import { getViewport, getOptionImageTargetWidth, getImageSizing } from '@/lib/utils/mediaSizing';

// Track started preloads across component mounts for the same course/version
// Maps versionKey -> { total, loaded } so we can report cached state
const preloadCache = new Map<string, { total: number; loaded: number }>();

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

async function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.decoding = 'async';
    img.loading = 'eager';
    img.src = url;
  });
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
    
    // If already preloaded, report cached state immediately
    const cached = preloadCache.get(versionKey);
    if (cached) {
      opts?.onProgress?.(cached.loaded, cached.total);
      return;
    }

    // Network conditions: respect Data Saver and 2g
    const conn: any = (navigator as any)?.connection;
    const saveData = !!conn?.saveData;
    const eff = String(conn?.effectiveType || '');
    if (saveData || /(^|-)2g$/.test(eff)) {
      // Skip aggressive preloading on constrained networks
      opts?.onProgress?.(0, 0);
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

    const total = targets.length;
    let loaded = 0;
    
    // Store in cache immediately (will be updated as loading progresses)
    preloadCache.set(versionKey, { total, loaded });
    
    const notify = () => {
      preloadCache.set(versionKey, { total, loaded });
      opts?.onProgress?.(loaded, total);
    };
    notify(); // Report initial state

    if (total === 0) {
      // No images to preload - cache is already set
      return;
    }

    // Concurrency-limited preloading
    const CONCURRENCY = 4;
    let idx = 0;
    let aborted = false;

    const runNext = async (): Promise<void> => {
      if (aborted) return;
      const i = idx++;
      if (i >= targets.length) return;
      const url = targets[i];
      try {
        await preloadImage(url);
      } finally {
        loaded += 1;
        notify();
        if (!aborted) await runNext();
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => runNext());

    Promise.all(workers).catch(() => {/* ignore */});

    return () => {
      aborted = true;
    };
  }, [course?.id, (course as any)?.contentVersion, opts?.onProgress]);
}
