/**
 * Test infrastructure for in-app test runner
 */

import { runCourseContractTest } from "./courseContract.test";
import { runCourseSchemaV2Test } from "./courseSchemaV2.test";
import { runAgentGenerateContractTest } from "./agent.generate.contract.test";
import { runAgentReviewContractTest } from "./agent.review.contract.test";
import { runRotationTests } from "./rotation.test";
import { runAdaptiveCoreTest } from "./adaptive.core.test";
import { runMathLevelsTest } from "./math.levels.test";
import { runHistoryLevelsTest } from "./history.levels.test";
import { runMathNumericGradeTest } from "./math.numeric-grade.test";
import { runEdgeSmokeTests, runEventLoggingTest } from "./edgeSmoke.test";
import { runStorageTests } from "./storage.test";
import { runA11yDomTests } from "./a11yDom.test";
import { runNavConfigTests } from "./navConfig.test";
import { runAssignmentFlowTest } from "./assignments.test";
import { runOfflineQueueTest } from "./offlineQueue.test";
import { runTTSTest } from "./tts.test";
import { runCatalogCacheTest } from "./catalogCache.test";
import { runEdgeValidationTest } from "./edgeValidation.test";
import { runEmbedTests } from "./embed.test";
import { runCatalogEtagTest } from "./catalogEtag.test";
import { runStudentAssignmentsTest } from "./studentAssignments.test";
import { runTeacherPermsTest } from "./teacherPerms.test";
import { runAssignmentProgressShapeTest } from "./assignmentProgressShape.test";
import { runGradebookCsvTest } from "./gradebookCsv.test";
import { runClassesTest } from "./classes.test";
import { runLevelFilterTest } from "./levelFilter.test";
import { runProgressRegressTest } from "./progressRegress.test";
import { runAdaptivePoolInitTest } from "./adaptive.pool-init-and-level-filter.test";
import { runAdaptiveCorrectRemovesTest } from "./adaptive.correct-removes-only-one.test";
import { runAdaptiveWrongRotationTest } from "./adaptive.wrong-duplicates-rotation.test";
import { runAdaptiveProgressRegressTest } from "./adaptive.progress-regresses-on-wrong.test";
import { runAdaptiveScoreRulesTest } from "./adaptive.score-rules.test";
import { runAdaptiveNoAutoAdvanceTest } from "./adaptive.no-auto-advance-on-correct.test";
import { runAdaptiveLevelFilterTest } from "./adaptive.level-filter.test";
import { runAdaptivePoolInitializationTest } from "./adaptive.pool-init.test";
import { runUiPhasePipelineTest } from "./ui.phase-pipeline.smoke.test";
import { runCatalogEtagRoundtripTest } from "./infra.catalog-etag-roundtrip.test";
import { runEdgeFunctionsManifestTest } from "./edgeFunctionsManifest.test";
import { runFunctionsErrorCorsTest } from "./functionsErrorCors.test";
import { runStorageCoursePoliciesTest } from "./storageCoursePolicies.test";
import { runRlsRolesSmokeTest } from "./rlsRolesSmoke.test";
import { runGameParityLiveTest } from "./gameParityLive.test";
import { runAgentGeneratorPlaceholderTest } from "./agentGeneratorPlaceholder.test";
import { runCatalogDebugScanTest } from "./catalogDebugScan.test";

export interface TestCase {
  id: string;
  name: string;
  run: () => Promise<{ pass: boolean; details?: any }>;
}

export interface TestResult {
  id: string;
  name: string;
  pass: boolean;
  durationMs: number;
  details?: any;
  error?: string;
}

/**
 * Registry of all tests
 * Add new tests to this array
 */
export const tests: TestCase[] = [
  {
    id: "course-contract",
    name: "Course Contract Validation",
    run: runCourseContractTest,
  },
  {
    id: "course-schema-v2",
    name: "Course Schema v2 Unit Tests",
    run: runCourseSchemaV2Test,
  },
  {
    id: "agent-generate-contract",
    name: "Agent Generate Contract",
    run: runAgentGenerateContractTest,
  },
  {
    id: "agent-review-contract",
    name: "Agent Review Contract",
    run: runAgentReviewContractTest,
  },
  {
    id: "math-levels",
    name: "Math Levels (Numeric Range Filtering)",
    run: runMathLevelsTest,
  },
  {
    id: "history-levels",
    name: "History Levels (Level 3 = Modern America, groups 7-9)",
    run: runHistoryLevelsTest,
  },
  {
    id: "math-numeric-grade",
    name: "Math Numeric Grading (Tolerance & Validation)",
    run: runMathNumericGradeTest,
  },
  {
    id: "adaptive-core",
    name: "Adaptive Core (Rotation + PoolSize + Progress)",
    run: runAdaptiveCoreTest,
  },
  {
    id: "adaptive-pool-init",
    name: "Adaptive Pool Init & Level Filter",
    run: runAdaptivePoolInitTest,
  },
  {
    id: "adaptive-correct-removes",
    name: "Adaptive Correct Removes Only One",
    run: runAdaptiveCorrectRemovesTest,
  },
  {
    id: "adaptive-wrong-rotation",
    name: "Adaptive Wrong Duplicates with Rotation",
    run: runAdaptiveWrongRotationTest,
  },
  {
    id: "adaptive-progress-regress",
    name: "Adaptive Progress Regresses on Wrong",
    run: runAdaptiveProgressRegressTest,
  },
  {
    id: "adaptive-score-rules",
    name: "Adaptive Score Rules (+1/-1, floor 0)",
    run: runAdaptiveScoreRulesTest,
  },
  {
    id: "adaptive-no-auto-advance",
    name: "Adaptive No Auto-Advance (UI controls timing)",
    run: runAdaptiveNoAutoAdvanceTest,
  },
  {
    id: "adaptive-level-filter",
    name: "Adaptive Level Filter (0-7, 8-15)",
    run: runAdaptiveLevelFilterTest,
  },
  {
    id: "adaptive-pool-initialization",
    name: "Adaptive Pool Initialization",
    run: runAdaptivePoolInitializationTest,
  },
  {
    id: "ui-phase-pipeline",
    name: "UI Phase Pipeline (idle→committing→feedback→advancing→idle)",
    run: runUiPhasePipelineTest,
  },
  {
    id: "progress-regress",
    name: "Progress Regression on Wrong Answer",
    run: runProgressRegressTest,
  },
  {
    id: "rotation-scoring",
    name: "Rotation & Scoring Logic",
    run: runRotationTests,
  },
  {
    id: "catalog-etag",
    name: "Catalog ETag Roundtrip",
    run: runCatalogEtagTest,
  },
  {
    id: "catalog-etag-roundtrip",
    name: "Catalog ETag Roundtrip (Infrastructure)",
    run: runCatalogEtagRoundtripTest,
  },
  {
    id: "edge-smoke",
    name: "Edge Functions Smoke Test (Live only)",
    run: runEdgeSmokeTests,
  },
  {
    id: "event-logging",
    name: "Event Logging Test (Live only)",
    run: runEventLoggingTest,
  },
  {
    id: "storage-perf",
    name: "Storage Performance & Timing (Live only)",
    run: runStorageTests,
  },
  {
    id: "a11y-dom",
    name: "Accessibility DOM Smoke Test",
    run: runA11yDomTests,
  },
  {
    id: "nav-config",
    name: "Navigation Config & Filtering",
    run: runNavConfigTests,
  },
  {
    id: "assignment-flow",
    name: "Assignment Flow (Mock only)",
    run: runAssignmentFlowTest,
  },
  {
    id: "offline-queue",
    name: "Offline Queue & Flush",
    run: runOfflineQueueTest,
  },
  {
    id: "tts-smoke",
    name: "TTS Smoke Test",
    run: runTTSTest,
  },
  {
    id: "catalog-cache",
    name: "Catalog Cache Performance",
    run: runCatalogCacheTest,
  },
  {
    id: "edge-validation",
    name: "Edge Function Input Validation",
    run: runEdgeValidationTest,
  },
  {
    id: "embed-mode",
    name: "Embed Mode Detection & Events",
    run: runEmbedTests,
  },
  {
    id: "student-assignments",
    name: "Student Assignments Listing",
    run: runStudentAssignmentsTest,
  },
  {
    id: "teacher-perms",
    name: "Teacher-only Endpoints (Role-aware)",
    run: runTeacherPermsTest,
  },
  {
    id: "assignment-progress-shape",
    name: "Assignment Progress Shape Validation",
    run: runAssignmentProgressShapeTest,
  },
  {
    id: "gradebook-csv",
    name: "Gradebook CSV Headers",
    run: runGradebookCsvTest,
  },
  {
    id: "classes",
    name: "Classes Management (Live only)",
    run: runClassesTest,
  },
  {
    id: "edge-functions-manifest",
    name: "Edge Functions Deployment Manifest",
    run: runEdgeFunctionsManifestTest,
  },
  {
    id: "functions-error-cors",
    name: "Unified Error Shape + CORS Headers",
    run: runFunctionsErrorCorsTest,
  },
  {
    id: "storage-course-policies",
    name: "Storage Policies (courses bucket)",
    run: runStorageCoursePoliciesTest,
  },
  {
    id: "rls-roles-smoke",
    name: "RLS/Role Gates Smoke Test",
    run: runRlsRolesSmokeTest,
  },
  {
    id: "game-parity-live",
    name: "Game Parity Live (start/log/end)",
    run: runGameParityLiveTest,
  },
  {
    id: "agent-generator-placeholder",
    name: "Generator Options Placeholder Contract",
    run: runAgentGeneratorPlaceholderTest,
  },
  {
    id: "catalog-debug-scan",
    name: "Catalog Scanner Debug Surface",
    run: runCatalogDebugScanTest,
  },
  // Example tests
  {
    id: "smoke-1",
    name: "API health check",
    run: async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { pass: true, details: { status: "ok" } };
    },
  },
  {
    id: "smoke-2",
    name: "Environment variables",
    run: async () => {
      const hasSupabaseUrl = !!import.meta.env.VITE_SUPABASE_URL;
      return {
        pass: hasSupabaseUrl,
        details: {
          VITE_SUPABASE_URL: hasSupabaseUrl ? "✓" : "✗",
        },
      };
    },
  },
];

/**
 * Run a single test case
 */
export async function runTest(test: TestCase): Promise<TestResult> {
  const startTime = performance.now();
  
  try {
    const result = await test.run();
    const durationMs = Math.round(performance.now() - startTime);
    
    return {
      id: test.id,
      name: test.name,
      pass: result.pass,
      durationMs,
      details: result.details,
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    
    return {
      id: test.id,
      name: test.name,
      pass: false,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run all tests
 */
export async function runAllTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  for (const test of tests) {
    const result = await runTest(test);
    results.push(result);
  }
  
  return results;
}

/**
 * Download test results as JSON
 */
export function downloadResults(results: TestResult[], filename = "test-results.json") {
  const data = {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    results,
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
