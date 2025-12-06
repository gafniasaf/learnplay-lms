import { renderHook, waitFor } from '@testing-library/react';
import { useJobContext } from '../useJobContext';
import { supabase } from '@/integrations/supabase/client';

// Mock Supabase
jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: jest.fn(),
    channel: jest.fn(),
    removeChannel: jest.fn(),
  },
}));

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

  it('fetches job and events when jobId is provided', async () => {
    const mockJob = { id: 'job-1', subject: 'Math', status: 'done', created_at: new Date().toISOString() };
    const mockEvents = [{ id: 'e1', job_id: 'job-1', step: 'generating', status: 'done', message: 'Done', created_at: new Date().toISOString() }];

    const mockChannel = {
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    };

    (supabase.from as jest.Mock).mockImplementation((table: string) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: table === 'ai_course_jobs' ? mockJob : null, error: null }),
      then: jest.fn((cb) => cb({ data: table === 'job_events' ? mockEvents : null, error: null })),
    }));

    (supabase.channel as jest.Mock).mockReturnValue(mockChannel);

    const { result } = renderHook(() => useJobContext('job-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.job).toEqual(mockJob);
    expect(result.current.events).toEqual(mockEvents);
    expect(result.current.error).toBeNull();
  });

  it('sets error when fetch fails', async () => {
    (supabase.from as jest.Mock).mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: new Error('Not found') }),
    }));

    const mockChannel = {
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    };
    (supabase.channel as jest.Mock).mockReturnValue(mockChannel);

    const { result } = renderHook(() => useJobContext('job-missing'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeTruthy();
    expect(result.current.job).toBeNull();
  });
});

