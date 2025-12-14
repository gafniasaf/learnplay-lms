/**
 * useJobStatus Hook Tests
 * Tests job status polling and state management
 */

// Mock useMCP before any imports
jest.mock('@/hooks/useMCP', () => ({
  useMCP: jest.fn(),
}));

import { renderHook, waitFor, act } from '@testing-library/react';
import { useJobStatus } from '@/hooks/useJobStatus';
import { useMCP } from '@/hooks/useMCP';

describe('useJobStatus', () => {
  const mockGetJobStatus = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (useMCP as jest.Mock).mockReturnValue({
      getJobStatus: mockGetJobStatus,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null status when jobId is null', () => {
    const { result } = renderHook(() => useJobStatus(null));
    expect(result.current.status).toBeNull();
    expect(mockGetJobStatus).not.toHaveBeenCalled();
  });

  it('polls for job status when jobId is provided', async () => {
    mockGetJobStatus.mockResolvedValue({
      state: 'running',
      step: 'generating',
      progress: 50,
      message: 'Generating course content',
    });

    const { result } = renderHook(() => useJobStatus('job-123'));

    await waitFor(() => {
      expect(mockGetJobStatus).toHaveBeenCalledWith('job-123');
    });

    await waitFor(() => {
      expect(result.current.status).toEqual({
        jobId: 'job-123',
        state: 'running',
        step: 'generating',
        progress: 50,
        message: 'Generating course content',
        lastEventTime: expect.any(String),
      });
    });
  });

  it('continues polling while job is in progress', async () => {
    mockGetJobStatus.mockResolvedValue({
      state: 'running',
      step: 'generating',
      progress: 30,
    });

    renderHook(() => useJobStatus('job-123'));

    // Wait for initial poll
    await waitFor(() => {
      expect(mockGetJobStatus).toHaveBeenCalled();
    });

    const initialCallCount = mockGetJobStatus.mock.calls.length;

    // Advance time to trigger next poll
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      // Verify at least one additional poll occurred
      expect(mockGetJobStatus.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it('stops polling when job is done', async () => {
    mockGetJobStatus.mockResolvedValue({
      state: 'done',
      step: 'complete',
      progress: 100,
    });

    const { result } = renderHook(() => useJobStatus('job-123'));

    await waitFor(() => {
      expect(result.current.status?.state).toBe('done');
    });

    const callCountAfterDone = mockGetJobStatus.mock.calls.length;

    // Advance time - should not poll again
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(mockGetJobStatus.mock.calls.length).toBe(callCountAfterDone);
  });

  it('stops polling when job has failed', async () => {
    mockGetJobStatus.mockResolvedValue({
      state: 'failed',
      step: 'error',
      progress: 0,
      message: 'Generation failed',
    });

    const { result } = renderHook(() => useJobStatus('job-123'));

    await waitFor(() => {
      expect(result.current.status?.state).toBe('failed');
    });

    const callCountAfterFail = mockGetJobStatus.mock.calls.length;

    // Advance time - should not poll again
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(mockGetJobStatus.mock.calls.length).toBe(callCountAfterFail);
  });

  it('handles poll errors gracefully', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    mockGetJobStatus.mockRejectedValue(new Error('Network error'));

    renderHook(() => useJobStatus('job-123'));

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[useJobStatus] poll error',
        'job-123',
        expect.any(Error)
      );
    });

    consoleWarnSpy.mockRestore();
  });

  it('cancels polling on unmount', async () => {
    mockGetJobStatus.mockResolvedValue({
      state: 'running',
      step: 'generating',
      progress: 50,
    });

    const { unmount } = renderHook(() => useJobStatus('job-123'));

    await waitFor(() => {
      expect(mockGetJobStatus).toHaveBeenCalledTimes(1);
    });

    unmount();

    // Advance time - polling should be cancelled
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    // Should not have polled after unmount
    expect(mockGetJobStatus.mock.calls.length).toBe(1);
  });

  it('resets status when jobId changes to null', async () => {
    mockGetJobStatus.mockResolvedValue({
      state: 'running',
      step: 'generating',
      progress: 50,
    });

    const { result, rerender } = renderHook(
      ({ jobId }) => useJobStatus(jobId),
      { initialProps: { jobId: 'job-123' as string | null } }
    );

    await waitFor(() => {
      expect(result.current.status?.jobId).toBe('job-123');
    });

    rerender({ jobId: null });

    await waitFor(() => {
      expect(result.current.status).toBeNull();
    });
  });

  it('handles missing data in response', async () => {
    mockGetJobStatus.mockResolvedValue(null);

    const { result } = renderHook(() => useJobStatus('job-123'));

    // Wait for poll attempt
    await act(async () => {
      await Promise.resolve();
    });

    // Status should remain null when response has no data
    expect(result.current.status).toBeNull();
  });

  it('stops polling on dead_letter state', async () => {
    mockGetJobStatus.mockResolvedValue({
      state: 'dead_letter',
      step: 'error',
      progress: 0,
    });

    const { result } = renderHook(() => useJobStatus('job-123'));

    await waitFor(() => {
      expect(result.current.status?.state).toBe('dead_letter');
    });

    const callCountAfterDeadLetter = mockGetJobStatus.mock.calls.length;

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(mockGetJobStatus.mock.calls.length).toBe(callCountAfterDeadLetter);
  });
});
