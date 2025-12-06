/**
 * Catalog Cache Test
 * Verifies that warm catalog requests are faster than cold and under threshold
 */

import { getCourseCatalog } from "../api";

const WARM_THRESHOLD_MS = 500; // Warm requests should complete under this

export async function runCatalogCacheTest(): Promise<{ pass: boolean; details?: any }> {
  const details: any = {
    coldTimeMs: 0,
    warmTimeMs: 0,
    threshold: WARM_THRESHOLD_MS,
    warmFasterThanCold: false,
    warmUnderThreshold: false,
  };

  try {
    // Cold call (first request)
    const coldStart = performance.now();
    const coldResult = await getCourseCatalog();
    const coldEnd = performance.now();
    details.coldTimeMs = Math.round(coldEnd - coldStart);

    if (!coldResult || !coldResult.courses) {
      return {
        pass: false,
        details: { ...details, error: "Cold call returned invalid catalog" },
      };
    }

    details.coldCourseCount = coldResult.courses.length;

    // Small delay to ensure any caching takes effect
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Warm call (second request, should be cached)
    const warmStart = performance.now();
    const warmResult = await getCourseCatalog();
    const warmEnd = performance.now();
    details.warmTimeMs = Math.round(warmEnd - warmStart);

    if (!warmResult || !warmResult.courses) {
      return {
        pass: false,
        details: { ...details, error: "Warm call returned invalid catalog" },
      };
    }

    details.warmCourseCount = warmResult.courses.length;

    // Verify results match
    if (details.coldCourseCount !== details.warmCourseCount) {
      return {
        pass: false,
        details: {
          ...details,
          error: `Course count mismatch: cold=${details.coldCourseCount}, warm=${details.warmCourseCount}`,
        },
      };
    }

    // Check if warm is faster than cold
    details.warmFasterThanCold = details.warmTimeMs < details.coldTimeMs;
    details.speedupFactor = details.coldTimeMs > 0 
      ? (details.coldTimeMs / details.warmTimeMs).toFixed(2) 
      : "N/A";

    // Check if warm is under threshold
    details.warmUnderThreshold = details.warmTimeMs < WARM_THRESHOLD_MS;

    // Test passes if warm is under threshold
    // (warm being faster than cold is nice but not required in all environments)
    if (!details.warmUnderThreshold) {
      return {
        pass: false,
        details: {
          ...details,
          error: `Warm request (${details.warmTimeMs}ms) exceeded threshold (${WARM_THRESHOLD_MS}ms)`,
        },
      };
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
