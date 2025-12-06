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

export function parseJobSummary(summaryJson: string | null): JobSummary | null {
  if (!summaryJson) return null;
  
  try {
    const parsed = JSON.parse(summaryJson);
    return parsed as JobSummary;
  } catch (error) {
    console.warn('Failed to parse job summary:', error);
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
