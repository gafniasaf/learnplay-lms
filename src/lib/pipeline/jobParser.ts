// Job Summary Parser
// Parses the structured JSON stored in ai_course_jobs.summary column

export interface RepairDetail {
  itemId: number;
  text: string;
  issue: string;
  fix: string;
}

export interface JobSummary {
  phases: {
    generation?: {
      duration: number;
      aiCalls: number;
      itemsProcessed: number;
    };
    validation?: {
      duration: number;
      errors: string[];
    };
    repair?: {
      duration: number;
      aiCalls: number;
      repairs: RepairDetail[];
    };
    review?: {
      duration: number;
      aiCalls: number;
      issues: string[];
    };
    images?: {
      duration: number;
      pending: number;
      note?: string;
    };
    enrichment?: {
      duration: number;
      guardrailsApplied: number;
    };
  };
  metrics: {
    totalItems: number;
    totalRepairs: number;
    totalAICalls: number;
    estimatedCost: number;
  };
  timeline: Array<{
    timestamp: string;
    phase: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
  }>;
}

/**
 * Validates that a parsed object matches the JobSummary structure
 * Uses type narrowing to avoid unsafe type assertions
 */
function isValidJobSummary(obj: unknown): obj is JobSummary {
  if (!obj || typeof obj !== 'object' || obj === null) return false;
  
  // Type guard: obj is now Record<string, unknown>
  if (!('phases' in obj) || !('metrics' in obj) || !('timeline' in obj)) {
    return false;
  }
  
  const candidate = obj as Record<string, unknown>;
  
  // Check required top-level properties with proper type checks
  const phases = candidate.phases;
  if (!phases || typeof phases !== 'object' || phases === null || Array.isArray(phases)) {
    return false;
  }
  
  const metrics = candidate.metrics;
  if (!metrics || typeof metrics !== 'object' || metrics === null || Array.isArray(metrics)) {
    return false;
  }
  
  const timeline = candidate.timeline;
  if (!Array.isArray(timeline)) {
    return false;
  }
  
  // Validate metrics structure with type narrowing
  const metricsObj = metrics as Record<string, unknown>;
  if (
    typeof metricsObj.totalItems !== 'number' ||
    typeof metricsObj.totalRepairs !== 'number' ||
    typeof metricsObj.totalAICalls !== 'number' ||
    typeof metricsObj.estimatedCost !== 'number'
  ) {
    return false;
  }
  
  // Validate timeline items have required structure
  for (const item of timeline) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof (item as Record<string, unknown>).timestamp !== 'string' ||
      typeof (item as Record<string, unknown>).phase !== 'string' ||
      typeof (item as Record<string, unknown>).message !== 'string' ||
      typeof (item as Record<string, unknown>).type !== 'string'
    ) {
      return false;
    }
  }
  
  return true;
}

export function parseJobSummary(summaryJson: string | Record<string, unknown> | null): JobSummary | null {
  if (!summaryJson) return null;
  
  try {
    let parsed: unknown;
    
    // If it's already an object, use it directly
    if (typeof summaryJson === 'object') {
      parsed = summaryJson;
    } else {
      // Otherwise parse as JSON string
      parsed = JSON.parse(summaryJson);
    }
    
    // Validate structure before returning
    if (isValidJobSummary(parsed)) {
      return parsed;
    }
    
    // Provide helpful error details for debugging
    const errorDetails = typeof parsed === 'object' && parsed !== null
      ? `Missing or invalid properties. Has phases: ${'phases' in parsed}, has metrics: ${'metrics' in parsed}, has timeline: ${'timeline' in parsed}`
      : `Invalid type: ${typeof parsed}`;
    console.warn('Job summary does not match expected structure:', errorDetails);
    return null;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Failed to parse job summary:', errorMessage);
    return null;
  }
}

export function createDefaultSummary(): JobSummary {
  return {
    phases: {},
    metrics: {
      totalItems: 0,
      totalRepairs: 0,
      totalAICalls: 0,
      estimatedCost: 0
    },
    timeline: []
  };
}
