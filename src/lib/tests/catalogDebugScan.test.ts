/**
 * Catalog Scanner Debug Surface Test
 * Ensures debug=1 outputs discovery details for list-courses
 */

export async function runCatalogDebugScanTest(): Promise<{ pass: boolean; details?: any }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  if (!supabaseUrl) {
    return {
      pass: false,
      details: { error: "VITE_SUPABASE_URL not configured" },
    };
  }

  const details: any = {
    requestStatus: "not tested",
    debugShape: "not tested",
    expectedCourses: "not tested",
    skippedAnalysis: "not tested",
  };

  let allPassed = true;

  // Expected courses in the catalog
  const expectedCourseIds = [
    "multiplication",
    "history",
    "science",
    "verbs",
  ];

  try {
    // Call list-courses with debug=1
    const listCoursesUrl = `${supabaseUrl}/functions/v1/list-courses?debug=1`;
    const response = await fetch(listCoursesUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (response.status === 200) {
      details.requestStatus = "✓ passed (200)";
    } else {
      details.requestStatus = `✗ failed (expected 200, got ${response.status})`;
      allPassed = false;
      return { pass: allPassed, details };
    }

    const data = await response.json();

    // Check for debug output structure
    if (data.debug) {
      const debug = data.debug;
      const hasScannedPrefixes = Array.isArray(debug.scannedPrefixes);
      const hasFound = Array.isArray(debug.found);
      const hasSkipped = Array.isArray(debug.skipped);

      if (hasScannedPrefixes && hasFound && hasSkipped) {
        details.debugShape = `✓ passed (scannedPrefixes: ${debug.scannedPrefixes.length}, found: ${debug.found.length}, skipped: ${debug.skipped.length})`;
      } else {
        const missing: string[] = [];
        if (!hasScannedPrefixes) missing.push("scannedPrefixes");
        if (!hasFound) missing.push("found");
        if (!hasSkipped) missing.push("skipped");
        
        details.debugShape = `✗ failed (missing: ${missing.join(", ")})`;
        allPassed = false;
      }

      // Check if all expected courses are found
      if (hasFound) {
        const foundIds = debug.found.map((item: any) => item.id || item);
        const missingCourses = expectedCourseIds.filter(id => !foundIds.includes(id));
        
        if (missingCourses.length === 0) {
          details.expectedCourses = `✓ passed (all ${expectedCourseIds.length} expected courses found)`;
        } else {
          details.expectedCourses = `✗ failed (missing: ${missingCourses.join(", ")})`;
          details.foundCourses = foundIds;
          allPassed = false;
        }
      } else {
        details.expectedCourses = "⚠ skipped (no debug.found array)";
      }

      // Analyze skipped items
      if (hasSkipped) {
        if (debug.skipped.length === 0) {
          details.skippedAnalysis = "✓ passed (no items skipped)";
        } else {
          // Check if skipped items have clear reasons
          const skippedWithReasons = debug.skipped.filter((item: any) => 
            item.reason || item.error || typeof item === 'string'
          );
          
          if (skippedWithReasons.length === debug.skipped.length) {
            details.skippedAnalysis = `⚠ warning (${debug.skipped.length} items skipped with reasons)`;
            details.skippedItems = debug.skipped.slice(0, 3); // First 3
          } else {
            details.skippedAnalysis = `✗ failed (${debug.skipped.length - skippedWithReasons.length} items skipped without clear reasons)`;
            allPassed = false;
          }
        }
      } else {
        details.skippedAnalysis = "⚠ skipped (no debug.skipped array)";
      }

    } else {
      details.debugShape = "✗ failed (no debug output in response)";
      allPassed = false;
    }

  } catch (err) {
    return {
      pass: false,
      details: {
        requestStatus: "✗ error",
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }

  return {
    pass: allPassed,
    details,
  };
}
