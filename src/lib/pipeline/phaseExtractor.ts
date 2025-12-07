// Phase Extractor
// Combines job status, summary JSON, and events to create detailed phase information

import type { JobSummary, RepairDetail } from './jobParser';

export interface PhaseDetail {
  id: number;
  name: string;
  status: 'complete' | 'active' | 'pending' | 'failed';
  duration?: number;
  aiCalls?: number;
  summary: string;
  details: {
    itemsProcessed?: number;
    repairs?: RepairDetail[];
    issues?: string[];
    errors?: string[];
    logs?: Array<{
      timestamp: string;
      message: string;
      type: 'info' | 'success' | 'warning' | 'error';
    }>;
  };
}

const PHASE_DEFINITIONS = [
  { id: 0, name: 'Course Generation', step: 'generating' },
  { id: 1, name: 'Validation', step: 'validating' },
  { id: 2, name: 'Batched Repair', step: 'repairing' },
  { id: 3, name: 'Reviewer Gating', step: 'reviewing' },
  { id: 4, name: 'Async Images', step: 'images' },
  { id: 5, name: 'Enrichment Guardrails', step: 'enriching' }
];

export function extractPhaseDetails(
  jobStatus: string,
  currentStep: string,
  summary: JobSummary | null
): PhaseDetail[] {
  const phases: PhaseDetail[] = [];
  
  // Phase 0: Generation
  phases.push({
    id: 0,
    name: 'Course Generation',
    status: determinePhaseStatus(0, jobStatus, currentStep),
    duration: summary?.phases?.generation?.duration,
    aiCalls: summary?.phases?.generation?.aiCalls || 1,
    summary: summary?.phases?.generation
      ? `Generated ${summary.phases.generation.itemsProcessed} items`
      : 'Generating course content',
    details: {
      itemsProcessed: summary?.phases?.generation?.itemsProcessed,
      logs: summary?.timeline?.filter(t => t.phase === 'generation') || []
    }
  });
  
  // Phase 1: Validation
  phases.push({
    id: 1,
    name: 'Validation',
    status: determinePhaseStatus(1, jobStatus, currentStep),
    duration: summary?.phases?.validation?.duration,
    aiCalls: 0,
    summary: summary?.phases?.validation?.errors?.length
      ? `Found ${summary.phases.validation.errors.length} validation errors`
      : 'Schema validation complete',
    details: {
      errors: summary?.phases?.validation?.errors || [],
      logs: summary?.timeline?.filter(t => t.phase === 'validation') || []
    }
  });
  
  // Phase 2: Repair
  phases.push({
    id: 2,
    name: 'Batched Repair',
    status: determinePhaseStatus(2, jobStatus, currentStep),
    duration: summary?.phases?.repair?.duration,
    aiCalls: summary?.phases?.repair?.aiCalls || 0,
    summary: summary?.phases?.repair?.repairs?.length
      ? `Repaired ${summary.phases.repair.repairs.length} items`
      : 'No repairs needed',
    details: {
      repairs: summary?.phases?.repair?.repairs || [],
      logs: summary?.timeline?.filter(t => t.phase === 'repair') || []
    }
  });
  
  // Phase 3: Review
  phases.push({
    id: 3,
    name: 'Reviewer Gating',
    status: determinePhaseStatus(3, jobStatus, currentStep),
    duration: summary?.phases?.review?.duration,
    aiCalls: summary?.phases?.review?.aiCalls || 0,
    summary: summary?.phases?.review?.issues?.length
      ? `Found ${summary.phases.review.issues.length} quality issues`
      : 'Review complete',
    details: {
      issues: summary?.phases?.review?.issues || [],
      logs: summary?.timeline?.filter(t => t.phase === 'review') || []
    }
  });
  
  // Phase 4: Images
  phases.push({
    id: 4,
    name: 'Async Images',
    status: determinePhaseStatus(4, jobStatus, currentStep),
    duration: summary?.phases?.images?.duration,
    aiCalls: 0,
    summary: summary?.phases?.images?.pending
      ? `${summary.phases.images.pending} images pending generation`
      : 'Image generation enqueued',
    details: {
      logs: summary?.timeline?.filter(t => t.phase === 'images') || []
    }
  });
  
  // Phase 5: Enrichment
  phases.push({
    id: 5,
    name: 'Enrichment Guardrails',
    status: determinePhaseStatus(5, jobStatus, currentStep),
    duration: summary?.phases?.enrichment?.duration,
    aiCalls: 0,
    summary: summary?.phases?.enrichment?.guardrailsApplied
      ? `Applied ${summary.phases.enrichment.guardrailsApplied} guardrails`
      : 'Enrichment complete',
    details: {
      logs: summary?.timeline?.filter(t => t.phase === 'enrichment') || []
    }
  });
  
  return phases;
}

function determinePhaseStatus(
  phaseId: number,
  jobStatus: string,
  currentStep: string
): 'complete' | 'active' | 'pending' | 'failed' {
  if (jobStatus === 'failed') {
    // Find which phase failed based on step
    const failedPhaseIndex = PHASE_DEFINITIONS.findIndex(p => p.step === currentStep);
    if (failedPhaseIndex === phaseId) return 'failed';
    if (failedPhaseIndex > phaseId) return 'complete';
    return 'pending';
  }
  
  if (jobStatus === 'done') {
    return 'complete';
  }
  
  // Map step to phase
  const stepToPhase: Record<string, number> = {
    'queued': -1,
    'generating': 0,
    'validating': 1,
    'repairing': 2,
    'reviewing': 3,
    'images': 4,
    'enriching': 5,
    'storage_write': 5,
    'catalog_update': 5,
    'verifying': 5,
    'done': 6
  };
  
  const currentPhaseIndex = stepToPhase[currentStep] ?? -1;
  
  if (phaseId < currentPhaseIndex) return 'complete';
  if (phaseId === currentPhaseIndex) return 'active';
  return 'pending';
}

export function getCurrentPhaseIndex(step: string): number {
  const stepToPhase: Record<string, number> = {
    'queued': -1,
    'generating': 0,
    'validating': 1,
    'repairing': 2,
    'reviewing': 3,
    'images': 4,
    'enriching': 5,
    'storage_write': 5,
    'catalog_update': 5,
    'verifying': 5,
    'done': 6
  };
  
  return stepToPhase[step] ?? -1;
}
