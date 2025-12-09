/**
 * Tests for session slug management
 */

import {
  readSessionSlug,
  writeSessionSlug,
  ensureSessionSlug,
  rotateSessionSlug,
} from '@/lib/session';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('session.ts', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  describe('readSessionSlug', () => {
    it('returns null when no slug exists', () => {
      expect(readSessionSlug()).toBeNull();
    });

    it('returns existing slug from localStorage', () => {
      const testSlug = 'test-session-slug-123';
      localStorageMock.setItem('ignite-session-slug:v2', testSlug);
      expect(readSessionSlug()).toBe(testSlug);
    });

    it('returns null in non-browser environment', () => {
      const originalWindow = global.window;
      // @ts-expect-error - testing SSR scenario
      delete global.window;
      expect(readSessionSlug()).toBeNull();
      global.window = originalWindow;
    });
  });

  describe('writeSessionSlug', () => {
    it('writes slug to localStorage', () => {
      const testSlug = 'new-session-slug';
      writeSessionSlug(testSlug);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'ignite-session-slug:v2',
        testSlug
      );
      expect(localStorageMock.getItem('ignite-session-slug:v2')).toBe(testSlug);
    });

    it('does nothing in non-browser environment', () => {
      const originalWindow = global.window;
      // @ts-expect-error - testing SSR scenario
      delete global.window;
      writeSessionSlug('test-slug');
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
      global.window = originalWindow;
    });
  });

  describe('ensureSessionSlug', () => {
    it('returns existing slug if present', () => {
      const existingSlug = 'existing-slug-123';
      localStorageMock.setItem('ignite-session-slug:v2', existingSlug);
      jest.clearAllMocks(); // Clear the setItem call from setup
      const result = ensureSessionSlug();
      expect(result).toBe(existingSlug);
      // purgeLegacyStorage may call removeItem, but should not call setItem for existing slug
      const setItemCalls = (localStorageMock.setItem as jest.Mock).mock.calls;
      const setItemForSlug = setItemCalls.some(call => call[0] === 'ignite-session-slug:v2');
      expect(setItemForSlug).toBe(false);
    });

    it('generates and stores new slug if none exists', () => {
      const slug = ensureSessionSlug();
      expect(slug).toBeTruthy();
      expect(typeof slug).toBe('string');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'ignite-session-slug:v2',
        slug
      );
      expect(readSessionSlug()).toBe(slug);
    });

    it('purges legacy storage keys', () => {
      const legacyKeys = [
        'ignite-session-slug',
        'ignite-plan',
        'mockup-cache',
        'mockup-history',
        'architect-plan',
      ];
      legacyKeys.forEach(key => {
        localStorageMock.setItem(key, 'legacy-value');
      });

      ensureSessionSlug();

      legacyKeys.forEach(key => {
        expect(localStorageMock.removeItem).toHaveBeenCalledWith(key);
      });
    });

    it('generates unique slugs on each call when none exists', () => {
      const slug1 = ensureSessionSlug();
      localStorageMock.clear();
      jest.clearAllMocks();
      const slug2 = ensureSessionSlug();
      expect(slug1).not.toBe(slug2);
    });
  });

  describe('rotateSessionSlug', () => {
    it('generates and stores a new slug', () => {
      const oldSlug = 'old-slug-123';
      localStorageMock.setItem('ignite-session-slug:v2', oldSlug);

      const newSlug = rotateSessionSlug();
      expect(newSlug).toBeTruthy();
      expect(newSlug).not.toBe(oldSlug);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'ignite-session-slug:v2',
        newSlug
      );
      expect(readSessionSlug()).toBe(newSlug);
    });

    it('generates unique slugs on each rotation', () => {
      const slug1 = rotateSessionSlug();
      const slug2 = rotateSessionSlug();
      expect(slug1).not.toBe(slug2);
    });
  });
});

