/**
 * Tests for useJobQuota hook
 * Tests job quota tracking, polling, error handling
 */

// Mock dependencies BEFORE imports
jest.mock('@/hooks/useMCP', () => ({
  useMCP: jest.fn(),
}));
jest.mock('@/lib/env', () => ({
  isLiveMode: jest.fn(() => true),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useJobQuota } from '@/hooks/useJobQuota';
import { useMCP } from '@/hooks/useMCP';
import { isLiveMode } from '@/lib/env';

const mockMCP = {
  getRecord: jest.fn(),
};

const mockJobQuota = {
  daily_limit: 10,
  daily_used: 5,
  weekly_limit: 50,
  weekly_used: 20,
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
  describe('in live mode', () => {
    beforeEach(() => {
      jest.mocked(isLiveMode).mockReturnValue(true);
    });

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
      // Should still provide default quota
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
      // Should still provide default quota
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

  describe('in guest mode', () => {
    const originalLocation = window.location;
    const originalGetItem = Storage.prototype.getItem;
    
    beforeEach(() => {
      // Mock guest mode detection - useJobQuota checks URL params and localStorage
      Object.defineProperty(window, 'location', {
        writable: true,
        configurable: true,
        value: { ...originalLocation, search: '?guest=1' },
      });
      
      // Mock localStorage
      Storage.prototype.getItem = jest.fn((key: string) => {
        if (key === 'guestMode') return 'true';
        return null;
      });
    });
    
    afterEach(() => {
      // Restore
      Object.defineProperty(window, 'location', {
        writable: true,
        configurable: true,
        value: originalLocation,
      });
      Storage.prototype.getItem = originalGetItem;
    });

    it('returns default quota without API call', async () => {
      const { result } = renderHook(() => useJobQuota());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.quota).toBeTruthy();
      expect(result.current.error).toBeNull();
      // Should not call API in guest mode
      expect(mockMCP.getRecord).not.toHaveBeenCalled();
    });

    it('does not poll in guest mode', async () => {
      const { result } = renderHook(() => useJobQuota());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        jest.advanceTimersByTime(60000);
      });

      // Should not trigger polling
      expect(mockMCP.getRecord).not.toHaveBeenCalled();
    });
  });

  describe('in mock mode', () => {
    beforeEach(() => {
      jest.mocked(isLiveMode).mockReturnValue(false);
    });

    it('returns default quota without API call', async () => {
      const { result } = renderHook(() => useJobQuota());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.quota).toBeTruthy();
      expect(result.current.error).toBeNull();
      expect(mockMCP.getRecord).not.toHaveBeenCalled();
    });
  });
});

