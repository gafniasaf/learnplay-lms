// Shared phase step constants - single source of truth
// Used across DB, Edge Functions, and UI

export const PHASE_STEPS = {
  QUEUED: 'queued',
  GENERATING: 'generating',
  VALIDATING: 'validating',
  REPAIRING: 'repairing',
  REVIEWING: 'reviewing',
  IMAGES: 'images',
  ENRICHING: 'enriching',
  STORAGE_WRITE: 'storage_write',
  CATALOG_UPDATE: 'catalog_update',
  VERIFYING: 'verifying',
  HEARTBEAT: 'heartbeat',
  DONE: 'done',
  FAILED: 'failed',
} as const;

export type PhaseStep = typeof PHASE_STEPS[keyof typeof PHASE_STEPS];

// Map steps to human-readable labels
export const PHASE_LABELS: Record<PhaseStep, string> = {
  [PHASE_STEPS.QUEUED]: 'Queued',
  [PHASE_STEPS.GENERATING]: 'Generate',
  [PHASE_STEPS.VALIDATING]: 'Validate',
  [PHASE_STEPS.REPAIRING]: 'Repair',
  [PHASE_STEPS.REVIEWING]: 'Review',
  [PHASE_STEPS.IMAGES]: 'Images',
  [PHASE_STEPS.ENRICHING]: 'Enrich',
  [PHASE_STEPS.STORAGE_WRITE]: 'Storage',
  [PHASE_STEPS.CATALOG_UPDATE]: 'Catalog',
  [PHASE_STEPS.VERIFYING]: 'Verify',
  [PHASE_STEPS.HEARTBEAT]: 'Heartbeat',
  [PHASE_STEPS.DONE]: 'Done',
  [PHASE_STEPS.FAILED]: 'Failed',
};

// Map steps to phase index for stepper
export const STEP_TO_PHASE_INDEX: Record<string, number> = {
  [PHASE_STEPS.QUEUED]: -1,
  pending: -1,
  [PHASE_STEPS.GENERATING]: 0,
  [PHASE_STEPS.VALIDATING]: 1,
  [PHASE_STEPS.REPAIRING]: 2,
  [PHASE_STEPS.REVIEWING]: 3,
  [PHASE_STEPS.IMAGES]: 4,
  [PHASE_STEPS.ENRICHING]: 5,
  [PHASE_STEPS.STORAGE_WRITE]: 5,
  [PHASE_STEPS.CATALOG_UPDATE]: 5,
  [PHASE_STEPS.VERIFYING]: 5,
  [PHASE_STEPS.DONE]: 6,
  processing: 2, // Default to repair phase
};
