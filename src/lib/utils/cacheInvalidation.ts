/**
 * CDN Cache Invalidation Utility
 * 
 * Invalidates CDN cache for course JSON and resolved snapshots
 */

/**
 * Invalidate course cache after publish or restore
 */
export async function invalidateCourseCache(courseId: string): Promise<{
  purged: number;
  paths: string[];
}> {
  const paths = [
    `/storage/v1/object/public/courses/${courseId}.json`,
    `/storage/v1/object/public/courses/${courseId}/resolved/beginner.json`,
    `/storage/v1/object/public/courses/${courseId}/resolved/intermediate.json`,
    `/storage/v1/object/public/courses/${courseId}/resolved/advanced.json`,
    `/storage/v1/object/public/courses/${courseId}/resolved/expert.json`,
  ];

  // Cloudflare CDN integration
  const CLOUDFLARE_ZONE_ID = import.meta.env.VITE_CLOUDFLARE_ZONE_ID;
  const CLOUDFLARE_API_TOKEN = import.meta.env.VITE_CLOUDFLARE_API_TOKEN;

  if (CLOUDFLARE_ZONE_ID && CLOUDFLARE_API_TOKEN) {
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ files: paths }),
        }
      );

      if (!response.ok) {
        throw new Error(`CDN purge failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[cacheInvalidation] CDN purge successful:', result);
    } catch (error) {
      console.error('[cacheInvalidation] CDN purge failed:', error);
      // Non-fatal: log but don't throw
    }
  } else {
    // No CDN configured, just log
    console.log('[cacheInvalidation] Would purge CDN paths (no CDN configured):', paths);
  }

  return {
    purged: paths.length,
    paths,
  };
}

/**
 * Invalidate all course caches (use sparingly)
 */
export async function invalidateAllCoursesCache(): Promise<void> {
  const CLOUDFLARE_ZONE_ID = import.meta.env.VITE_CLOUDFLARE_ZONE_ID;
  const CLOUDFLARE_API_TOKEN = import.meta.env.VITE_CLOUDFLARE_API_TOKEN;

  if (CLOUDFLARE_ZONE_ID && CLOUDFLARE_API_TOKEN) {
    try {
      await fetch(
        `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ purge_everything: true }),
        }
      );
      console.log('[cacheInvalidation] Purged all CDN caches');
    } catch (error) {
      console.error('[cacheInvalidation] Full purge failed:', error);
    }
  } else {
    console.log('[cacheInvalidation] Would purge all course caches (no CDN configured)');
  }
}

