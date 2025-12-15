import { isLiveMode } from "../env";
import type { CourseCatalog } from "../types/courseCatalog";
import { shouldUseMockData, fetchWithTimeout, ApiError, getSupabaseUrl, callEdgeFunctionGetRaw } from "./common";
import { createLogger } from "../logger";

const log = createLogger("api/catalog");

/**
 * Get the full course catalog
 * Uses instant cache-first strategy with optional background revalidation
 * Automatically busts cache when contentVersion changes
 */
export async function getCourseCatalog(): Promise<
  CourseCatalog & { _metadata?: { dataSource: "live" | "mock"; etag?: string } }
> {
  const liveMode = isLiveMode();

  // Mock responses forbidden: if anything tries to run non-live, isLiveMode/shouldUseMockData will throw.
  void liveMode;
  void shouldUseMockData;

  log.info("Loading course catalog from Edge Function (LIVE mode)", {
    action: "getCourseCatalog",
    source: "live",
  });
  const supabaseUrl = getSupabaseUrl();

  // Check for hard-bust flags
  const params = new URLSearchParams(window.location.search);
  const urlRefresh = params.get("refresh") === "1";
  const localBust = localStorage.getItem("catalog.bust") === "true";
  const forceRefresh = urlRefresh || localBust;

  if (forceRefresh) {
    log.info("Hard-bust triggered - forcing fresh fetch", {
      action: "getCourseCatalog",
      reason: urlRefresh ? "url_refresh" : "local_bust",
    });
    localStorage.removeItem("catalogJson");
    localStorage.removeItem("catalogEtag");
    localStorage.removeItem("catalogVersions");
    localStorage.removeItem("catalog.bust");
    return fetchFreshCatalog(supabaseUrl, true);
  }

  // Check for cached data first - return immediately if available
  const cachedJson = localStorage.getItem("catalogJson");
  const storedEtag = localStorage.getItem("catalogEtag") || "";

  if (cachedJson) {
    const cached = JSON.parse(cachedJson) as CourseCatalog;

    // Validate cache - clear if item counts are wrong
    const hasInvalidItemCount = cached.courses.some((c) => c.itemCount === 12);
    if (hasInvalidItemCount) {
      log.warn("Cached data has invalid item counts, clearing cache", {
        action: "getCourseCatalog",
      });
      localStorage.removeItem("catalogJson");
      localStorage.removeItem("catalogEtag");
      localStorage.removeItem("catalogVersions");
      return fetchFreshCatalog(supabaseUrl, false);
    }

    log.info("Returning cached catalog immediately (dataSource: live)", {
      action: "getCourseCatalog",
    });
    if (storedEtag) {
      log.debug("Cached ETag", { action: "getCourseCatalog", etag: storedEtag });
    }
    log.debug("Cached courses", {
      action: "getCourseCatalog",
      courseIds: cached.courses.map((c) => c.id),
    });

    // Background revalidation with contentVersion checking (fire-and-forget)
    revalidateCatalogWithVersionCheck(supabaseUrl, storedEtag, cachedJson).catch(
      (err) => {
        log.warn("Background revalidation failed", {
          action: "getCourseCatalog",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    );

    return {
      ...cached,
      _metadata: { dataSource: "live", etag: storedEtag },
    };
  }

  // No cache - fetch fresh data with cache-busting
  log.info("No cache, fetching fresh data from API with cache-busting", {
    action: "getCourseCatalog",
  });
  return fetchFreshCatalog(supabaseUrl, true);
}

/**
 * Background revalidation with contentVersion checking
 * Automatically triggers page reload if versions change
 */
async function revalidateCatalogWithVersionCheck(
  supabaseUrl: string,
  storedEtag: string,
  cachedJson: string
): Promise<void> {
  void storedEtag;
  void cachedJson;

  // Get cached versions for comparison
  const cachedVersionsJson = localStorage.getItem("catalogVersions");
  const cachedVersions = cachedVersionsJson
    ? (JSON.parse(cachedVersionsJson) as Record<string, string>)
    : {};

  const res = await callEdgeFunctionGetRaw("list-courses", undefined, { timeoutMs: 30000, maxRetries: 1 });

    if (res.status === 304) {
      log.debug("Background revalidation: cache still valid (304)", {
        action: "revalidateCatalogWithVersionCheck",
      });
    return;
  }

  if (res.ok) {
    const apiJson = await res.json() as any;
    const items = Array.isArray(apiJson.items) ? apiJson.items : [];
    const catalog: CourseCatalog = {
      courses: items.map((it: any) => ({
        id: it.id,
        title: it.title || it.id,
        subject: it.subject || 'General',
        gradeBand: it.grade || 'All Grades',
        contentVersion: it.contentVersion || '',
        description: it.description || '',
        itemCount: typeof it.itemCount === 'number' ? it.itemCount : 0,
        duration: '15 min',
        difficulty: 'Intermediate',
      })),
    };
    const newEtag = res.headers.get("ETag");

    // Build version map from new catalog
    const newVersions: Record<string, string> = {};
    for (const course of catalog.courses) {
      if (course.contentVersion) {
        newVersions[course.id] = course.contentVersion;
      }
    }

    // Check if any course version changed
    let versionChanged = false;
    for (const [courseId, newVersion] of Object.entries(newVersions)) {
      const cachedVersion = cachedVersions[courseId];
        if (cachedVersion && cachedVersion !== newVersion) {
          log.info("ContentVersion changed for course", {
            action: "revalidateCatalogWithVersionCheck",
            courseId,
            from: cachedVersion,
            to: newVersion,
          });
        versionChanged = true;
      }
    }

    if (versionChanged) {
      // Clear cache and dispatch event for React to re-render
      log.info("Course versions changed - clearing cache and triggering re-render", {
        action: "revalidateCatalogWithVersionCheck",
      });
      localStorage.removeItem("catalogJson");
      localStorage.removeItem("catalogEtag");
      localStorage.removeItem("catalogVersions");
      
      // Update cache with new data first
      if (newEtag) {
        localStorage.setItem("catalogEtag", newEtag);
        localStorage.setItem("catalogJson", JSON.stringify(catalog));
        localStorage.setItem("catalogVersions", JSON.stringify(newVersions));
      }

      // Dispatch custom event to notify React components to refetch
      window.dispatchEvent(new CustomEvent('catalog-version-changed', {
        detail: { catalog, etag: newEtag }
      }));
      
      log.debug("Dispatched catalog-version-changed event", {
        action: "revalidateCatalogWithVersionCheck",
      });
      return;
    }

    // No version changes - update cache normally
    if (newEtag) {
      localStorage.setItem("catalogEtag", newEtag);
      localStorage.setItem("catalogJson", JSON.stringify(catalog));
      localStorage.setItem("catalogVersions", JSON.stringify(newVersions));
      log.info("Background revalidation: cache updated with new data", {
        action: "revalidateCatalogWithVersionCheck",
      });
    }
  }
}

/**
 * Fetch fresh catalog data (cold path)
 */
async function fetchFreshCatalog(
  supabaseUrl: string,
  noCache: boolean = false
): Promise<
  CourseCatalog & { _metadata?: { dataSource: "live" | "mock"; etag?: string } }
> {
  void supabaseUrl;
  const liveMode = isLiveMode();

  // Check for cached fallback data
  const cachedJson = localStorage.getItem("catalogJson");
  const cached = cachedJson ? (JSON.parse(cachedJson) as CourseCatalog) : null;
  const storedEtag = localStorage.getItem("catalogEtag") || "";

  try {
    // Build URL with cache-busting parameter if needed
    const params: Record<string, string> = { limit: "1000" };
    if (noCache) params.t = String(Date.now());
    const res = await callEdgeFunctionGetRaw("list-courses", params, { timeoutMs: 30000, maxRetries: 1 });

    // 304 - cache is still valid
    if (res.status === 304) {
      log.debug("Catalog cache still valid (304)", {
        action: "fetchFreshCatalog",
      });
      if (cached) {
        return {
          ...cached,
          _metadata: { dataSource: "live", etag: storedEtag },
        };
      }
      // In LIVE mode, throw error instead of falling back to mock
      if (liveMode) {
        throw new ApiError(
          "304 response but no cached data available in LIVE mode",
          "NO_CACHE",
          304
        );
      }
      return { courses: [], _metadata: { dataSource: "mock" } };
    }

    if (!res.ok) {
      const errorText = await res.text();
      log.error("[API] Failed to fetch catalog from API", undefined, {
        action: "fetchFreshCatalog",
        errorText,
      });

      // In LIVE mode, use cache if available, otherwise throw
      if (liveMode) {
        if (cached) {
          log.warn("Using stale cached data after fetch error (LIVE mode)", {
            action: "fetchFreshCatalog",
          });
          return {
            ...cached,
            _metadata: { dataSource: "live", etag: storedEtag },
          };
        }
        throw new ApiError(`Failed to fetch catalog in LIVE mode: ${errorText}`, "FETCH_FAILED", res.status);
      }

      // DEV mode fallback
      if (cached) {
        log.warn("Using cached data after fetch error", {
          action: "fetchFreshCatalog",
        });
        return {
          ...cached,
          _metadata: { dataSource: "live", etag: storedEtag },
        };
      }
      log.warn("Falling back to mock data", { action: "fetchFreshCatalog" });
      return {
        courses: [],
        _metadata: { dataSource: "mock" },
      };
    }

    const apiData = await res.json() as any;
    const items = Array.isArray(apiData.items) ? apiData.items : [];
    const catalog: CourseCatalog = {
      courses: items.map((it: any) => ({
        id: it.id,
        title: it.title || it.id,
        subject: it.subject || 'General',
        gradeBand: it.grade || 'All Grades',
        contentVersion: it.contentVersion || '',
        description: it.description || '',
        itemCount: typeof it.itemCount === 'number' ? it.itemCount : 0,
        duration: '15 min',
        difficulty: 'Intermediate',
      })),
    };

    // Store ETag and data
    const newEtag = res.headers.get("ETag");
    if (newEtag) {
      localStorage.setItem("catalogEtag", newEtag);
      log.info("Stored new ETag", { action: "fetchFreshCatalog", etag: newEtag });
    }
    localStorage.setItem("catalogJson", JSON.stringify(catalog));

    // Store contentVersion map for cache busting on version changes
    const versions: Record<string, string> = {};
    for (const course of catalog.courses) {
      if (course.contentVersion) {
        versions[course.id] = course.contentVersion;
      }
    }
    localStorage.setItem("catalogVersions", JSON.stringify(versions));
    log.info("Stored contentVersions", {
      action: "fetchFreshCatalog",
      courseCount: Object.keys(versions).length,
    });

    // In LIVE mode, return empty catalog rather than falling back to mock
    if (!catalog.courses || catalog.courses.length === 0) {
      if (liveMode) {
        log.warn("API returned 0 courses in LIVE mode", {
          action: "fetchFreshCatalog",
        });
        return {
          courses: [],
          _metadata: { dataSource: "live", etag: newEtag || undefined },
        };
      }
      return {
        courses: [],
        _metadata: { dataSource: "mock" },
      };
    }

    log.info("Loaded courses from API (dataSource: live)", {
      action: "fetchFreshCatalog",
      count: catalog.courses.length,
      courseIds: catalog.courses.map((c) => c.id),
    });
    return {
      ...catalog,
      _metadata: { dataSource: "live", etag: newEtag || undefined },
    };
  } catch (error) {
    log.error("[API] Exception fetching catalog", error as Error, {
      action: "fetchFreshCatalog",
    });

    // In LIVE mode, use cache if available, otherwise rethrow
    if (liveMode) {
      if (cached) {
        log.warn("Using stale cached data after exception (LIVE mode)", {
          action: "fetchFreshCatalog",
        });
        return {
          ...cached,
          _metadata: { dataSource: "live", etag: storedEtag },
        };
      }
      throw error;
    }

    // DEV mode fallback
    if (cached) {
      log.warn("Using cached data after exception", {
        action: "fetchFreshCatalog",
      });
      return {
        ...cached,
        _metadata: { dataSource: "live", etag: storedEtag },
      };
    }
    log.warn("Falling back to mock data after exception", {
      action: "fetchFreshCatalog",
    });
    return {
      courses: [],
      _metadata: { dataSource: "mock" },
    };
  }
}

/**
 * Search courses using the list-courses Edge Function
 * @param search - Search query to filter courses by title, subject, or ID
 * @param options - Additional options for pagination and sorting
 */
export async function searchCourses({
  search = '',
  page = 1,
  limit = 100,
  sort = 'newest' as 'newest' | 'oldest' | 'title_asc' | 'title_desc',
}: {
  search?: string;
  page?: number;
  limit?: number;
  sort?: 'newest' | 'oldest' | 'title_asc' | 'title_desc';
} = {}): Promise<{
  items: Array<{
    id: string;
    title: string;
    subject: string;
    description: string;
    grade: string;
    itemCount: number;
    visibility: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  params.append('page', page.toString());
  params.append('limit', limit.toString());
  params.append('sort', sort);

  const res = await callEdgeFunctionGetRaw("list-courses", Object.fromEntries(params.entries()), {
    timeoutMs: 30000,
    maxRetries: 1,
  });

  if (!res.ok) {
    throw new ApiError(
      `Failed to search courses: ${res.statusText}`,
      'SEARCH_FAILED',
      res.status
    );
  }

  return res.json();
}

/**
 * Fetch course catalog - simplified wrapper for React Query
 * @returns Array of courses with id and title
 */
export async function fetchCatalog(): Promise<
  Array<{ id: string; title: string }>
> {
  const catalog = await getCourseCatalog();
  return catalog.courses.map((c) => ({ id: c.id, title: c.title }));
}
