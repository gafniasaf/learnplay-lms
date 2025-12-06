import { renderHook, waitFor } from '@testing-library/react';
import { useJobContext } from '../useJobContext';

// Mock the useMCP hook
jest.mock('../useMCP', () => ({
  useMCP: () => ({
    getCourseJob: jest.fn(),
  }),
}));

// Mock Supabase for realtime (still used for subscriptions)
jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    })),
    removeChannel: jest.fn(),
  },
}));

import { useMCP } from '../useMCP';

describe('useJobContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty state when jobId is null', () => {
    const { result } = renderHook(() => useJobContext(null));
    expect(result.current).toEqual({
      job: null,
      events: [],
      loading: false,
      error: null,
    });
  });

  it('fetches job via edge function when jobId is provided', async () => {
    const mockJob = { 
      id: 'job-1', 
      subject: 'Math', 
      status: 'done', 
      created_at: new Date().toISOString(),
      summary: {}
    };

    (useMCP as jest.Mock).mockReturnValue({
      getCourseJob: jest.fn().mockResolvedValue({ 
        ok: true, 
        job: mockJob, 
        error: null 
      }),
    });

    const { result } = renderHook(() => useJobContext('job-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.job).toEqual(mockJob);
    expect(result.current.error).toBeNull();
  });

  it('sets error when fetch fails', async () => {
    (useMCP as jest.Mock).mockReturnValue({
      getCourseJob: jest.fn().mockResolvedValue({ 
        ok: false, 
        job: null, 
        error: { message: 'Not found' } 
      }),
    });

    const { result } = renderHook(() => useJobContext('job-missing'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeTruthy();
    expect(result.current.job).toBeNull();
  });
});
