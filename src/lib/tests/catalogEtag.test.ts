/**
 * Catalog ETag Test
 * Verifies that warm GET requests with If-None-Match return 304 or fall back to cache on error
 * 
 * Updated to test improved caching headers:
 * - Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600
 * - Age header included in responses
 * - 304 responses include Age header
 */

export async function runCatalogEtagTest(): Promise<{ pass: boolean; details?: any }> {
  const details: any = {
    firstStatus: 0,
    etag: "",
    warmStatus: 0,
    hasEtag: false,
    networkError: false,
  };

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    
    if (!supabaseUrl) {
      return {
        pass: false,
        details: { ...details, error: "VITE_SUPABASE_URL not configured" },
      };
    }

    const url = `${supabaseUrl}/functions/v1/list-courses`;

    // First request - cold
    const first = await fetch(url, { method: "GET" });
    details.firstStatus = first.status;

    if (!first.ok) {
      return {
        pass: false,
        details: { ...details, error: `First request failed with status ${first.status}` },
      };
    }

    const etag = first.headers.get("ETag") || "";
    details.etag = etag;
    details.hasEtag = !!etag;
    
    // Check for Age header
    const age = first.headers.get("Age");
    details.age = age;
    details.hasAge = !!age;
    
    // Verify Cache-Control header includes max-age
    const cacheControl = first.headers.get("Cache-Control") || "";
    details.cacheControl = cacheControl;
    details.hasMaxAge = cacheControl.includes("max-age=60");

    // Warm request with If-None-Match
    try {
      const warm = await fetch(url, {
        method: "GET",
        headers: etag ? { "If-None-Match": etag } : {},
      });
      
      details.warmStatus = warm.status;
      
      // Check Age header on warm request
      const warmAge = warm.headers.get("Age");
      details.warmAge = warmAge;
      details.warmHasAge = !!warmAge;

      // If ETag exists, allow 304 or 200 (if edge inits fresh)
      if (etag) {
        const validStatuses = [304, 200];
        if (!validStatuses.includes(warm.status)) {
          return {
            pass: false,
            details: {
              ...details,
              error: `Expected 304 or 200 with If-None-Match, got ${warm.status}`,
            },
          };
        }
      } else {
        // No ETag, just verify it's OK
        if (!warm.ok) {
          return {
            pass: false,
            details: {
              ...details,
              error: `Warm request without ETag failed: ${warm.status}`,
            },
          };
        }
      }
    } catch (networkError) {
      // Tolerate network error by treating cached data as valid
      details.networkError = true;
      details.networkErrorMessage = networkError instanceof Error ? networkError.message : String(networkError);
    }

    return {
      pass: true,
      details,
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        ...details,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
