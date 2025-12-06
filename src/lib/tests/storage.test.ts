/**
 * Storage Performance Tests
 * Tests course loading performance from storage in LIVE mode
 */

import { getApiMode, getCourseCatalog, getCourse } from "@/lib/api";

const SOFT_THRESHOLD_MS = 500;

/**
 * Measure duration of an async function
 */
async function measureDuration<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = Math.round(performance.now() - start);
  return { result, durationMs };
}

/**
 * Calculate approximate size of object in bytes
 */
function getObjectSize(obj: any): number {
  const str = JSON.stringify(obj);
  return new Blob([str]).size;
}

/**
 * Run storage performance tests
 * Only executes in LIVE mode, skips in MOCK mode
 */
export async function runStorageTests(): Promise<{
  pass: boolean;
  details: any;
}> {
  const mode = getApiMode();

  // Skip in mock mode
  if (mode === "mock") {
    return {
      pass: true,
      details: {
        mode,
        status: "skipped",
        reason: "Storage tests only run in LIVE mode",
      },
    };
  }

  try {
    // Test 1: List courses
    console.log("[Storage] Fetching course catalog...");
    const catalogMeasurement = await measureDuration(() => getCourseCatalog());

    const catalogDuration = catalogMeasurement.durationMs;
    const catalogSize = getObjectSize(catalogMeasurement.result);
    const catalogCount = catalogMeasurement.result.courses?.length || 0;

    if (catalogCount === 0) {
      return {
        pass: false,
        details: {
          mode,
          step: "list-courses",
          error: "No courses found in catalog",
          durationMs: catalogDuration,
        },
      };
    }

    // Test 2: Get first course
    console.log("[Storage] Fetching first course...");
    const firstCourseId = catalogMeasurement.result.courses[0].id;
    const course1Measurement = await measureDuration(() =>
      getCourse(firstCourseId)
    );

    const course1Duration = course1Measurement.durationMs;
    const course1Size = getObjectSize(course1Measurement.result);
    const course1ItemCount = course1Measurement.result.items?.length || 0;

    // Test 3: Get second course (if available)
    let course2Duration = 0;
    let course2Size = 0;
    let course2ItemCount = 0;
    let secondCourseId: string | null = null;

    if (catalogCount >= 2) {
      console.log("[Storage] Fetching second course...");
      secondCourseId = catalogMeasurement.result.courses[1].id;
      const course2Measurement = await measureDuration(() =>
        getCourse(secondCourseId!)
      );

      course2Duration = course2Measurement.durationMs;
      course2Size = getObjectSize(course2Measurement.result);
      course2ItemCount = course2Measurement.result.items?.length || 0;
    }

    // Check soft thresholds
    const catalogSlow = catalogDuration > SOFT_THRESHOLD_MS;
    const course1Slow = course1Duration > SOFT_THRESHOLD_MS;
    const course2Slow = secondCourseId ? course2Duration > SOFT_THRESHOLD_MS : false;

    const warnings: string[] = [];
    if (catalogSlow) {
      warnings.push(
        `list-courses took ${catalogDuration}ms (>${SOFT_THRESHOLD_MS}ms)`
      );
    }
    if (course1Slow) {
      warnings.push(
        `get-course(${firstCourseId}) took ${course1Duration}ms (>${SOFT_THRESHOLD_MS}ms)`
      );
    }
    if (course2Slow) {
      warnings.push(
        `get-course(${secondCourseId}) took ${course2Duration}ms (>${SOFT_THRESHOLD_MS}ms)`
      );
    }

    // Test passes even with warnings (soft threshold)
    return {
      pass: true,
      details: {
        mode,
        status: "success",
        thresholdMs: SOFT_THRESHOLD_MS,
        warnings: warnings.length > 0 ? warnings : undefined,
        catalog: {
          durationMs: catalogDuration,
          sizeBytes: catalogSize,
          courseCount: catalogCount,
          slow: catalogSlow,
        },
        course1: {
          id: firstCourseId,
          durationMs: course1Duration,
          sizeBytes: course1Size,
          itemCount: course1ItemCount,
          slow: course1Slow,
        },
        course2: secondCourseId
          ? {
              id: secondCourseId,
              durationMs: course2Duration,
              sizeBytes: course2Size,
              itemCount: course2ItemCount,
              slow: course2Slow,
            }
          : { skipped: "Only one course in catalog" },
        summary: {
          totalCalls: secondCourseId ? 3 : 2,
          totalDurationMs: catalogDuration + course1Duration + course2Duration,
          averageDurationMs: Math.round(
            (catalogDuration + course1Duration + course2Duration) /
              (secondCourseId ? 3 : 2)
          ),
          totalSizeBytes: catalogSize + course1Size + course2Size,
          allUnderThreshold: !catalogSlow && !course1Slow && !course2Slow,
        },
      },
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        mode,
        error: `Storage test failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        errorDetails: error instanceof Error ? error.stack : undefined,
      },
    };
  }
}
