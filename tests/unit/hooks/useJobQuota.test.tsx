/**
 * Tests for useJobQuota hook
 * Tests job quota tracking, polling, error handling
 */

// Mock dependencies BEFORE imports
jest.mock('@/hooks/useMCP', () => ({
  useMCP: jest.fn(),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useJobQuota } from '@/hooks/useJobQuota';
import { useMCP } from '@/hooks/useMCP';

const mockMCP = {
  getRecord: jest.fn(),
};

const mockJobQuota = {
  jobs_last_hour: 1,
  hourly_limit: 10,
  jobs_last_day: 3,
  daily_limit: 50,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (useMCP as jest.Mock).mockReturnValue(mockMCP);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useJobQuota', () => {
  it('fetches quota from MCP', async () => {
    mockMCP.getRecord.mockResolvedValue({
      record: mockJobQuota,
    });

    const { result } = renderHook(() => useJobQuota());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.quota).toEqual(mockJobQuota);
    expect(result.current.error).toBeNull();
    expect(mockMCP.getRecord).toHaveBeenCalledWith('UserJobQuota', 'current');
  });

  it('handles quota not found error', async () => {
    mockMCP.getRecord.mockResolvedValue({
      record: null,
    });

    const { result } = renderHook(() => useJobQuota());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.error?.message).toContain('not found');
    // Should still provide default quota so UI doesn't break
    expect(result.current.quota).toBeTruthy();
  });

  it('handles API errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockMCP.getRecord.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useJobQuota());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    // Error message is preserved from the original error
    expect(result.current.error?.message).toBe('Network error');
    expect(consoleErrorSpy).toHaveBeenCalled();
    // Should still provide default quota so UI doesn't break
    expect(result.current.quota).toBeTruthy();

    consoleErrorSpy.mockRestore();
  });

  it('polls quota every minute', async () => {
    mockMCP.getRecord.mockResolvedValue({
      record: mockJobQuota,
    });

    const { result } = renderHook(() => useJobQuota());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockMCP.getRecord).toHaveBeenCalledTimes(1);

    // Advance time by 1 minute
    act(() => {
      jest.advanceTimersByTime(60000);
    });

    await waitFor(() => {
      expect(mockMCP.getRecord).toHaveBeenCalledTimes(2);
    });
  });

  it('cleans up interval on unmount', async () => {
    mockMCP.getRecord.mockResolvedValue({
      record: mockJobQuota,
    });

    const { result, unmount } = renderHook(() => useJobQuota());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const callCount = mockMCP.getRecord.mock.calls.length;

    unmount();

    // Advance time - should not trigger more calls
    act(() => {
      jest.advanceTimersByTime(60000);
    });

    expect(mockMCP.getRecord.mock.calls.length).toBe(callCount);
  });
});

