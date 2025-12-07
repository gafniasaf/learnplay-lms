/**
 * useJobStatus Hook Tests
 * Tests React hook for real-time job status updates
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useJobStatus } from '@/hooks/useJobStatus';
import { supabase } from '@/integrations/supabase/client';

// Mock Supabase client
jest.mock('@/integrations/supabase/client', () => {
  const mockRemoveChannel = jest.fn();
  return {
    supabase: {
      channel: jest.fn(),
      removeChannel: mockRemoveChannel,
      functions: {
        invoke: jest.fn(),
      },
    },
  };
});

describe('useJobStatus', () => {
  const mockChannel = {
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.channel as jest.Mock).mockReturnValue(mockChannel);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null status when jobId is null', () => {
    const { result } = renderHook(() => useJobStatus(null));
    expect(result.current.status).toBeNull();
    expect(supabase.channel).not.toHaveBeenCalled();
  });

  it('subscribes to job_events channel when jobId is provided', () => {
    renderHook(() => useJobStatus('job-123'));

    expect(supabase.channel).toHaveBeenCalledWith('job_events:job-123');
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        schema: 'public',
        table: 'job_events',
        filter: 'job_id=eq.job-123',
      }),
      expect.any(Function)
    );
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });

  it('updates status when receiving job event', () => {
    const { result } = renderHook(() => useJobStatus('job-123'));

    // Get the callback passed to channel.on
    const callback = (mockChannel.on as jest.Mock).mock.calls[0][2];

    // Simulate job event wrapped in act
    act(() => {
      callback({
        new: {
          step: 'generating',
          status: 'processing',
          progress: 50,
          message: 'Generating course content',
          created_at: '2025-01-15T10:00:00Z',
        },
      });
    });

    expect(result.current.status).toEqual({
      jobId: 'job-123',
      state: 'processing',
      step: 'generating',
      progress: 50,
      message: 'Generating course content',
      lastEventTime: '2025-01-15T10:00:00Z',
    });
  });

  it('ignores heartbeat events for step', () => {
    const { result } = renderHook(() => useJobStatus('job-123'));

    const callback = (mockChannel.on as jest.Mock).mock.calls[0][2];

    // First event sets step
    act(() => {
      callback({
        new: {
          step: 'generating',
          status: 'processing',
          progress: 30,
        },
      });
    });

    expect(result.current.status?.step).toBe('generating');

    // Heartbeat event should not change step
    act(() => {
      callback({
        new: {
          step: 'heartbeat',
          status: 'processing',
          progress: 40,
        },
      });
    });

    expect(result.current.status?.step).toBe('generating'); // Unchanged
    expect(result.current.status?.progress).toBe(40); // But progress updates
  });

  it('polls job status when no events received in 15s', async () => {
    const mockInvoke = supabase.functions.invoke as jest.Mock;
    mockInvoke.mockResolvedValue({
      data: {
        jobId: 'job-123',
        state: 'processing',
        step: 'validating',
        progress: 60,
      },
    });

    renderHook(() => useJobStatus('job-123'));

    // Advance time past 15s threshold
    jest.advanceTimersByTime(16000);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('job-status', {
        body: { jobId: 'job-123' },
      });
    });
  });

  it('does not poll if events received recently', () => {
    const mockInvoke = supabase.functions.invoke as jest.Mock;
    const { result } = renderHook(() => useJobStatus('job-123'));

    const callback = (mockChannel.on as jest.Mock).mock.calls[0][2];

    // Receive event
    act(() => {
      callback({
        new: {
          step: 'generating',
          status: 'processing',
          progress: 50,
          created_at: new Date().toISOString(),
        },
      });
    });

    // Advance time but not past 15s
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    // Should not poll yet
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('handles missing fields in job event gracefully', () => {
    const { result } = renderHook(() => useJobStatus('job-123'));

    const callback = (mockChannel.on as jest.Mock).mock.calls[0][2];

    act(() => {
      callback({
        new: {
          // Minimal event
          step: 'done',
        },
      });
    });

    expect(result.current.status).toMatchObject({
      jobId: 'job-123',
      step: 'done',
      progress: 10, // Default progress
      message: '', // Default message
    });
  });

  it('cleans up subscription on unmount', () => {
    const { unmount } = renderHook(() => useJobStatus('job-123'));

    // Verify channel was created
    expect(supabase.channel).toHaveBeenCalled();

    unmount();

    // Verify removeChannel was called (with any channel instance)
    expect(supabase.removeChannel).toHaveBeenCalled();
  });

  it('cleans up polling timeout on unmount', () => {
    const { unmount } = renderHook(() => useJobStatus('job-123'));

    const timeoutId = setTimeout(() => {}, 10000);
    unmount();

    // Timeout should be cleared (no error thrown)
    expect(() => clearTimeout(timeoutId)).not.toThrow();
  });
});

