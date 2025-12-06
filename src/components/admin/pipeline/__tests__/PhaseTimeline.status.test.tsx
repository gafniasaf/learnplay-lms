import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock usePipelineJob to avoid Realtime client
let mockEvents: any[] = [];
let mockJob: any = { status: 'running' };
jest.mock('@/hooks/usePipelineJob', () => ({
  usePipelineJob: () => ({ events: mockEvents, job: mockJob })
}));

describe('PhaseTimeline - status mapping', () => {
  afterEach(() => {
    mockEvents = [];
    mockJob = { status: 'running' };
  });

  it('shows waiting indicators while generating', async () => {
    mockEvents = [{ step: 'generating' }];
    const { PhaseTimeline } = await import('../RightInspector/PhaseTimeline');
    render(<PhaseTimeline jobId="job-1" />);

    const waiting = await screen.findAllByText('Waiting...');
    expect(waiting.length).toBeGreaterThan(0);
    // Generate should be marked complete, but at least one other phase should be Waiting...
    expect(screen.getAllByText('Complete').length).toBeGreaterThanOrEqual(1);
  });

  it('marks all phases complete when job is done', async () => {
    mockEvents = [
      { step: 'generating' },
      { step: 'validating' },
      { step: 'repairing' },
      { step: 'reviewing' },
      { step: 'images' },
      { step: 'enriching' },
    ];
    mockJob = { status: 'done' };
    const { PhaseTimeline } = await import('../RightInspector/PhaseTimeline');
    render(<PhaseTimeline jobId="job-1" />);

    const complete = await screen.findAllByText('Complete');
    expect(complete.length).toBe(6);
  });
});
