import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/hooks/useJobContext', () => ({
  useJobContext: () => ({
    job: {
      id: 'job-2', subject: 'math', status: 'done', grade: null, grade_band: '3-5',
      items_per_group: 12, levels_count: 3, mode: 'options', result_path: 'path.json', error: null,
      summary: JSON.stringify({ metrics: { totalItems: 36 }, phases: {} }),
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), course_id: 'c-1', created_by: 'u1',
    },
    events: [
      { step: 'generating' },
      { step: 'validating' },
      { step: 'repairing' },
      { step: 'reviewing' },
      { step: 'images' },
      { step: 'enriching' },
    ], loading: false, error: null,
  })
}));

import { OverviewTab } from '../MainCanvas/OverviewTab';

describe('OverviewTab - phase stepper', () => {
  it('marks phases complete and shows View Course on done', () => {
    render(<OverviewTab jobId="job-2" />);
    expect(screen.getByRole('button', { name: /view course/i })).toBeInTheDocument();
    expect(screen.getByTestId('phase-generate')).toHaveAttribute('data-status', 'complete');
    expect(screen.getByTestId('phase-validate')).toHaveAttribute('data-status', 'complete');
  });
});
