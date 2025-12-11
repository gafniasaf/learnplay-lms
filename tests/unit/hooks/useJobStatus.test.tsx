/**
 * useJobStatus Hook Tests
 * Tests React hook for real-time job status updates via MCP polling
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useJobStatus } from '@/hooks/useJobStatus';

// Mock useMCP
jest.mock('@/hooks/useMCP', () => ({
  useMCP: jest.fn(),
}));

import { useMCP } from '@/hooks/useMCP';

describe('useJobStatus', () => {
  const mockMCP = {
    getJobStatus: jest.fn(),
    call: jest.fn(),
    getRecord: jest.fn(),
    saveRecord: jest.fn(),
    enqueueJob: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (useMCP as jest.Mock).mockReturnValue(mockMCP);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null status when jobId is null', () => {
    const { result } = renderHook(() => useJobStatus(null));
    expect(result.current.status).toBeNull();
    expect(mockMCP.getJobStatus).not.toHaveBeenCalled();
  });

  it('polls for job status when jobId is provided', async () => {
    mockMCP.getJobStatus.mockResolvedValue({
      state: 'running',
      step: 'generating',
      progress: 50,
      message: 'Generating content',
    });

    renderHook(() => useJobStatus('job-123'));

    await waitFor(() => {
      expect(mockMCP.getJobStatus).toHaveBeenCalledWith('job-123');
    });
  });

  it('updates status when poll returns data', async () => {
    mockMCP.getJobStatus.mockResolvedValue({
      state: 'running',
      step: 'generating',
      progress: 50,
      message: 'Generating content',
    });

    const { result } = renderHook(() => useJobStatus('job-123'));

    await waitFor(() => {
      expect(result.current.status).toMatchObject({
        jobId: 'job-123',
        state: 'running',
        step: 'generating',
        progress: 50,
        message: 'Generating content',
      });
    });
  });

  it('stops polling when job reaches terminal state', async () => {
    mockMCP.getJobStatus.mockResolvedValue({
      state: 'done',
      step: 'done',
      progress: 100,
      message: 'Complete',
    });

    const { result } = renderHook(() => useJobStatus('job-123'));

    await waitFor(() => {
      expect(result.current.status?.state).toBe('done');
    });

    // Clear the mock call count
    mockMCP.getJobStatus.mockClear();

    // Advance time past next poll interval
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // Should not have polled again since job is done
    expect(mockMCP.getJobStatus).not.toHaveBeenCalled();
  });

  it('handles poll errors gracefully', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    mockMCP.getJobStatus.mockRejectedValue(new Error('Network error'));

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

  it('cleans up polling on unmount', async () => {
    mockMCP.getJobStatus.mockResolvedValue({
      state: 'running',
      step: 'generating',
      progress: 50,
    });

    const { unmount } = renderHook(() => useJobStatus('job-123'));

    await waitFor(() => {
      expect(mockMCP.getJobStatus).toHaveBeenCalled();
    });

    // Clear mock calls
    mockMCP.getJobStatus.mockClear();

    // Unmount
    unmount();

    // Advance time - should not poll after unmount
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(mockMCP.getJobStatus).not.toHaveBeenCalled();
  });

  it('resets status when jobId changes to null', async () => {
    mockMCP.getJobStatus.mockResolvedValue({
      state: 'running',
      step: 'generating',
      progress: 50,
    });

    const { result, rerender } = renderHook(
      ({ jobId }) => useJobStatus(jobId),
      { initialProps: { jobId: 'job-123' as string | null } }
    );

    await waitFor(() => {
      expect(result.current.status).toBeTruthy();
    });

    // Change to null
    rerender({ jobId: null });

    expect(result.current.status).toBeNull();
  });
});
