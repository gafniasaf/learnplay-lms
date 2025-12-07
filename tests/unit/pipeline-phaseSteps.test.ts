/**
 * Pipeline Phase Steps Tests
 */

import {
  PHASE_STEPS,
  PHASE_LABELS,
  STEP_TO_PHASE_INDEX,
  type PhaseStep,
} from '@/lib/pipeline/phaseSteps';

describe('PHASE_STEPS', () => {
  it('exports all phase step constants', () => {
    expect(PHASE_STEPS.QUEUED).toBe('queued');
    expect(PHASE_STEPS.GENERATING).toBe('generating');
    expect(PHASE_STEPS.VALIDATING).toBe('validating');
    expect(PHASE_STEPS.REPAIRING).toBe('repairing');
    expect(PHASE_STEPS.REVIEWING).toBe('reviewing');
    expect(PHASE_STEPS.IMAGES).toBe('images');
    expect(PHASE_STEPS.ENRICHING).toBe('enriching');
    expect(PHASE_STEPS.STORAGE_WRITE).toBe('storage_write');
    expect(PHASE_STEPS.CATALOG_UPDATE).toBe('catalog_update');
    expect(PHASE_STEPS.VERIFYING).toBe('verifying');
    expect(PHASE_STEPS.HEARTBEAT).toBe('heartbeat');
    expect(PHASE_STEPS.DONE).toBe('done');
    expect(PHASE_STEPS.FAILED).toBe('failed');
  });
});

describe('PHASE_LABELS', () => {
  it('has labels for all phase steps', () => {
    expect(PHASE_LABELS[PHASE_STEPS.QUEUED]).toBe('Queued');
    expect(PHASE_LABELS[PHASE_STEPS.GENERATING]).toBe('Generate');
    expect(PHASE_LABELS[PHASE_STEPS.VALIDATING]).toBe('Validate');
    expect(PHASE_LABELS[PHASE_STEPS.REPAIRING]).toBe('Repair');
    expect(PHASE_LABELS[PHASE_STEPS.REVIEWING]).toBe('Review');
    expect(PHASE_LABELS[PHASE_STEPS.IMAGES]).toBe('Images');
    expect(PHASE_LABELS[PHASE_STEPS.ENRICHING]).toBe('Enrich');
    expect(PHASE_LABELS[PHASE_STEPS.STORAGE_WRITE]).toBe('Storage');
    expect(PHASE_LABELS[PHASE_STEPS.CATALOG_UPDATE]).toBe('Catalog');
    expect(PHASE_LABELS[PHASE_STEPS.VERIFYING]).toBe('Verify');
    expect(PHASE_LABELS[PHASE_STEPS.HEARTBEAT]).toBe('Heartbeat');
    expect(PHASE_LABELS[PHASE_STEPS.DONE]).toBe('Done');
    expect(PHASE_LABELS[PHASE_STEPS.FAILED]).toBe('Failed');
  });
});

describe('STEP_TO_PHASE_INDEX', () => {
  it('maps steps to correct phase indices', () => {
    expect(STEP_TO_PHASE_INDEX[PHASE_STEPS.QUEUED]).toBe(-1);
    expect(STEP_TO_PHASE_INDEX[PHASE_STEPS.GENERATING]).toBe(0);
    expect(STEP_TO_PHASE_INDEX[PHASE_STEPS.VALIDATING]).toBe(1);
    expect(STEP_TO_PHASE_INDEX[PHASE_STEPS.REPAIRING]).toBe(2);
    expect(STEP_TO_PHASE_INDEX[PHASE_STEPS.REVIEWING]).toBe(3);
    expect(STEP_TO_PHASE_INDEX[PHASE_STEPS.IMAGES]).toBe(4);
    expect(STEP_TO_PHASE_INDEX[PHASE_STEPS.ENRICHING]).toBe(5);
    expect(STEP_TO_PHASE_INDEX[PHASE_STEPS.STORAGE_WRITE]).toBe(5);
    expect(STEP_TO_PHASE_INDEX[PHASE_STEPS.CATALOG_UPDATE]).toBe(5);
    expect(STEP_TO_PHASE_INDEX[PHASE_STEPS.VERIFYING]).toBe(5);
    expect(STEP_TO_PHASE_INDEX[PHASE_STEPS.DONE]).toBe(6);
  });

  it('includes legacy step mappings', () => {
    expect(STEP_TO_PHASE_INDEX['pending']).toBe(-1);
    expect(STEP_TO_PHASE_INDEX['processing']).toBe(2);
  });
});

