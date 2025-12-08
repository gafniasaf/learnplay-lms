import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LiveLogs } from '../RightInspector/LiveLogs';

jest.mock('@/hooks/useJobContext', () => ({
  useJobContext: () => ({
    job: { id: 'job-1', subject: 'Test', status: 'done', created_at: new Date().toISOString() },
    events: [
      { id: '1', job_id: 'job-1', status: 'info', step: 'generating', progress: 10, message: 'Starting', created_at: new Date().toISOString() },
      { id: '2', job_id: 'job-1', status: 'storage_write', step: 'storage_write', progress: 75, message: 'Course JSON uploaded', created_at: new Date().toISOString() },
    ],
    loading: false,
    error: null,
  })
}));

beforeAll(() => {
  // JSDOM doesn't implement scrollIntoView; stub it for the test
   
  (HTMLElement.prototype as any).scrollIntoView = () => {};
});

describe('LiveLogs', () => {
  it('renders logs and toggles auto-scroll button label', () => {
    render(<LiveLogs jobId="job-1" />);
    // Verbose toggle defaults to Concise, so only step-level events show
    expect(screen.getByText(/Starting/)).toBeInTheDocument();
    // storage_write is not a step event, so it's filtered out by default; toggle Verbose to see it
    const verboseBtn = screen.getByRole('button', { name: /concise/i });
    fireEvent.click(verboseBtn);
    expect(screen.getByRole('button', { name: /verbose/i })).toBeInTheDocument();
    expect(screen.getByText(/Course JSON uploaded/)).toBeInTheDocument();

    const autoBtn = screen.getByRole('button', { name: /auto/i });
    fireEvent.click(autoBtn);
    expect(screen.getByRole('button', { name: /manual/i })).toBeInTheDocument();
  });
});
