import { useEffect, useRef } from 'react';
import type { Course } from '@/lib/types/course';
import { resolvePublicMediaUrl } from '@/lib/media/resolvePublicMediaUrl';
import { getOptimizedImageUrl } from '@/lib/utils/imageOptimizer';
import { getViewport, getOptionImageTargetWidth, getImageSizing } from '@/lib/utils/mediaSizing';

// Track started preloads across component mounts for the same course/version
const startedKeys = new Set<string>();

// Identify if a string looks like an image URL or storage path
function isImageLike(u?: string): boolean {
  if (!u) return false;
  const low = u.toLowerCase();
  return /(\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg)(\?|$)/.test(low) || !/^https?:\/\//.test(low);
}

type PreloadTarget = { url: string; kind: 'stem' | 'option' };

function collectImageTargets(course: Course): PreloadTarget[] {
  const targets: PreloadTarget[] = [];

  for (const item of course.items || []) {
    // Stem/stimulus image
    const stim: any = (item as any).stimulus;
    if (stim?.type === 'image' && stim.url) {
      targets.push({ url: stim.url, kind: 'stem' });
    }

    // Newer schema stem media array
    const stemMedia = (item as any)?.stem?.media as Array<any> | undefined;
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
    if ((item as any).mode === 'visual-mcq' && Array.isArray((item as any).options)) {
      for (const opt of (item as any).options) {
        if (typeof opt === 'string' && isImageLike(opt)) targets.push({ url: opt, kind: 'option' });
      }
    }

    // Diagram labeling: diagram image
    if ((item as any).mode === 'diagram-label' && typeof (item as any).diagramUrl === 'string') {
      const u = (item as any).diagramUrl as string;
      if (isImageLike(u)) targets.push({ url: u, kind: 'stem' });
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
    if (!course?.id || !Array.isArray(course.items) || course.items.length === 0) return;

    // Only run once per course version across the app session
    const versionKey = `${course.id}:${course.contentVersion ?? 'nov'}`;
    if (startedKeys.has(versionKey)) return;
    startedKeys.add(versionKey);

    // Network conditions: respect Data Saver and 2g
    const conn: any = (navigator as any)?.connection;
    const saveData = !!conn?.saveData;
    const eff = String(conn?.effectiveType || '');
    if (saveData || /(^|-)2g$/.test(eff)) {
      // Skip aggressive preloading on constrained networks
      return;
    }

    const viewport = getViewport();
    const stemWidth = getImageSizing('stem', viewport as any).maxWidth;
    const optionWidth = getOptionImageTargetWidth(viewport as any);

    const targets = collectImageTargets(course).map((t) => {
      const abs = resolvePublicMediaUrl(t.url, course.contentVersion);
      const width = t.kind === 'stem' ? stemWidth : optionWidth;
      const optimized = getOptimizedImageUrl(abs, { width, quality: t.kind === 'stem' ? 85 : 80 });
      return optimized;
    });

    const total = targets.length;
    let loaded = 0;
    const notify = () => opts?.onProgress?.(loaded, total);
    notify();

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
  }, [course?.id, course?.contentVersion, Array.isArray(course?.items) ? course!.items.length : 0]);
}
