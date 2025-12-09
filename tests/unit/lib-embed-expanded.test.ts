/**
 * Expanded tests for embed utilities
 * Tests PostMessage security, origin validation, embed detection
 */

import {
  isEmbed,
  isCourseFullscreen,
  postToHost,
  listenHost,
  setAllowedOrigins,
  type EmbedEvent,
} from '@/lib/embed';

// Mock window.location
const mockLocation = {
  href: 'https://example.com/play?embed=1',
  pathname: '/play',
  search: '?embed=1',
};

Object.defineProperty(window, 'location', {
  writable: true,
  value: mockLocation,
});

describe('embed utilities - Expanded Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setAllowedOrigins([]);
    mockLocation.href = 'https://example.com/play?embed=1';
    mockLocation.pathname = '/play';
    mockLocation.search = '?embed=1';
  });

  describe('isEmbed', () => {
    it('returns true when embed=1 is present', () => {
      mockLocation.href = 'https://example.com/play?embed=1';
      expect(isEmbed()).toBe(true);
    });

    it('returns false when embed=1 is not present', () => {
      mockLocation.href = 'https://example.com/play';
      expect(isEmbed()).toBe(false);
    });

    it('returns false when embed has different value', () => {
      mockLocation.href = 'https://example.com/play?embed=0';
      expect(isEmbed()).toBe(false);
    });

    it('handles multiple query parameters', () => {
      mockLocation.href = 'https://example.com/play?course=123&embed=1&level=2';
      expect(isEmbed()).toBe(true);
    });
  });

  describe('isCourseFullscreen', () => {
    it('returns true for /play path', () => {
      mockLocation.pathname = '/play';
      expect(isCourseFullscreen()).toBe(true);
    });

    it('returns true for /play/course-123 path', () => {
      mockLocation.pathname = '/play/course-123';
      expect(isCourseFullscreen()).toBe(true);
    });

    it('returns true when fullscreen=1 is present', () => {
      mockLocation.pathname = '/courses';
      mockLocation.search = '?fullscreen=1';
      expect(isCourseFullscreen()).toBe(true);
    });

    it('returns false for non-play paths without fullscreen param', () => {
      mockLocation.pathname = '/courses';
      mockLocation.search = '';
      expect(isCourseFullscreen()).toBe(false);
    });

    it('returns false in SSR environment', () => {
      const originalWindow = global.window;
      // @ts-expect-error - testing SSR scenario
      delete global.window;
      expect(isCourseFullscreen()).toBe(false);
      global.window = originalWindow;
    });
  });

  describe('postToHost', () => {
    let mockPostMessage: jest.SpyInstance;

    beforeEach(() => {
      mockPostMessage = jest.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    });

    afterEach(() => {
      mockPostMessage.mockRestore();
    });

    it('sends message when in embed mode', () => {
      mockLocation.href = 'https://example.com/play?embed=1';
      const event: EmbedEvent = { type: 'ready', payload: { version: '1.0.0' } };

      postToHost(event);

      expect(mockPostMessage).toHaveBeenCalledWith(event, '*');
    });

    it('does not send message when not in embed mode', () => {
      mockLocation.href = 'https://example.com/play';
      const event: EmbedEvent = { type: 'ready' };

      postToHost(event);

      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it('handles postMessage errors gracefully', () => {
      mockLocation.href = 'https://example.com/play?embed=1';
      mockPostMessage.mockImplementation(() => {
        throw new Error('PostMessage blocked');
      });
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const event: EmbedEvent = { type: 'ready' };
      postToHost(event);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Embed] Failed to post message to host:',
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });

    it('sends all event types correctly', () => {
      mockLocation.href = 'https://example.com/play?embed=1';

      const events: EmbedEvent[] = [
        { type: 'ready', payload: { version: '1.0.0' } },
        { type: 'round:start', payload: { courseId: 'c1', roundId: 'r1' } },
        { type: 'attempt', payload: { roundId: 'r1', itemId: 1, correct: true } },
        { type: 'round:end', payload: { roundId: 'r1', finalScore: 80, mistakes: 2, durationMs: 5000 } },
        { type: 'resize', payload: { height: 600 } },
        { type: 'exit', payload: {} },
        { type: 'error', payload: { message: 'Test error' } },
        { type: 'stats', payload: { score: 80, mistakes: 2, level: 1, itemsRemaining: 5, elapsedSeconds: 120 } },
      ];

      events.forEach(event => {
        postToHost(event);
      });

      expect(mockPostMessage).toHaveBeenCalledTimes(events.length);
    });
  });

  describe('listenHost', () => {
    let messageHandler: jest.Mock;
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      messageHandler = jest.fn();
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it('processes messages from allowed origins', () => {
      setAllowedOrigins(['https://allowed.com']);
      listenHost(messageHandler);

      const event = new MessageEvent('message', {
        origin: 'https://allowed.com',
        data: { type: 'command', payload: { action: 'next' } },
      });

      window.dispatchEvent(event);

      expect(messageHandler).toHaveBeenCalledWith(event);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('rejects messages from disallowed origins when list is set', () => {
      setAllowedOrigins(['https://allowed.com']);
      listenHost(messageHandler);

      const event = new MessageEvent('message', {
        origin: 'https://evil.com',
        data: { type: 'command', payload: { action: 'next' } },
      });

      window.dispatchEvent(event);

      expect(messageHandler).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Embed] Rejected message from disallowed origin:',
        'https://evil.com'
      );
    });

    it('allows all origins when allowed list is empty (permissive default)', () => {
      setAllowedOrigins([]);
      listenHost(messageHandler);

      const event = new MessageEvent('message', {
        origin: 'https://any-origin.com',
        data: { type: 'command', payload: { action: 'next' } },
      });

      window.dispatchEvent(event);

      expect(messageHandler).toHaveBeenCalledWith(event);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('handles multiple listeners', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      listenHost(handler1);
      listenHost(handler2);

      const event = new MessageEvent('message', {
        origin: 'https://example.com',
        data: { type: 'command', payload: { action: 'next' } },
      });

      window.dispatchEvent(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
    });
  });

  describe('setAllowedOrigins', () => {
    it('sets allowed origins list', () => {
      setAllowedOrigins(['https://example.com', 'https://test.com']);

      // Verify by testing listenHost behavior
      const handler = jest.fn();
      listenHost(handler);

      const allowedEvent = new MessageEvent('message', {
        origin: 'https://example.com',
        data: {},
      });
      window.dispatchEvent(allowedEvent);
      expect(handler).toHaveBeenCalled();

      handler.mockClear();

      const disallowedEvent = new MessageEvent('message', {
        origin: 'https://evil.com',
        data: {},
      });
      window.dispatchEvent(disallowedEvent);
      expect(handler).not.toHaveBeenCalled();
    });

    it('overwrites previous allowed origins', () => {
      setAllowedOrigins(['https://old.com']);
      setAllowedOrigins(['https://new.com']);

      const handler = jest.fn();
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      listenHost(handler);

      const oldEvent = new MessageEvent('message', {
        origin: 'https://old.com',
        data: {},
      });
      window.dispatchEvent(oldEvent);
      expect(consoleWarnSpy).toHaveBeenCalled();

      handler.mockClear();
      consoleWarnSpy.mockClear();

      const newEvent = new MessageEvent('message', {
        origin: 'https://new.com',
        data: {},
      });
      window.dispatchEvent(newEvent);
      expect(handler).toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });
});

