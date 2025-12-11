/**
 * Unit Tests: imageOptimizer
 * Tests client-side image optimization utilities
 */

import { getOptimizedImageUrl, preloadImage, generateSrcSet, useLazyImage } from '@/lib/utils/imageOptimizer';

describe('getOptimizedImageUrl', () => {
  it('returns original URL for non-Supabase URLs', () => {
    const url = 'https://example.com/image.jpg';
    expect(getOptimizedImageUrl(url)).toBe(url);
  });

  it('returns empty string for empty URL', () => {
    expect(getOptimizedImageUrl('')).toBe('');
  });

  it('returns undefined for undefined URL', () => {
    expect(getOptimizedImageUrl(undefined as unknown as string)).toBe(undefined);
  });

  it('adds transform parameters to Supabase Storage URL', () => {
    const url = 'https://myproject.supabase.co/storage/v1/object/public/images/photo.jpg';
    const result = getOptimizedImageUrl(url);
    
    expect(result).toContain('width=512');
    expect(result).toContain('height=512');
    expect(result).toContain('quality=85');
  });

  it('uses custom dimensions when provided', () => {
    const url = 'https://myproject.supabase.co/storage/v1/object/public/images/photo.jpg';
    const result = getOptimizedImageUrl(url, { width: 256, height: 256, quality: 90 });
    
    expect(result).toContain('width=256');
    expect(result).toContain('height=256');
    expect(result).toContain('quality=90');
  });

  it('returns original URL for invalid URL format', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const invalidUrl = 'not-a-valid-url-but-contains-supabase.co/storage';
    
    // The function should handle this gracefully
    const result = getOptimizedImageUrl(invalidUrl);
    
    // Should return original URL on error
    expect(result).toBe(invalidUrl);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Failed to optimize image URL:',
      expect.objectContaining({ message: expect.stringContaining('Invalid URL') })
    );
    consoleWarnSpy.mockRestore();
  });

  it('handles URL with existing parameters', () => {
    const url = 'https://myproject.supabase.co/storage/v1/object/public/images/photo.jpg?existing=param';
    const result = getOptimizedImageUrl(url);
    
    expect(result).toContain('existing=param');
    expect(result).toContain('width=512');
  });
});

describe('preloadImage', () => {
  let appendChildSpy: jest.SpyInstance;
  
  beforeEach(() => {
    // Mock document.head.appendChild
    appendChildSpy = jest.spyOn(document.head, 'appendChild').mockImplementation((node) => node);
  });

  afterEach(() => {
    appendChildSpy.mockRestore();
  });

  it('creates a preload link element', () => {
    preloadImage('https://example.com/image.jpg');
    
    expect(appendChildSpy).toHaveBeenCalled();
    const link = appendChildSpy.mock.calls[0][0] as HTMLLinkElement;
    expect(link.rel).toBe('preload');
    expect(link.as).toBe('image');
    expect(link.href).toContain('image.jpg');
  });
});

describe('generateSrcSet', () => {
  it('generates srcset for Supabase URLs', () => {
    const baseUrl = 'https://myproject.supabase.co/storage/v1/object/public/images/photo.jpg';
    const srcSet = generateSrcSet(baseUrl);
    
    expect(srcSet).toContain('256w');
    expect(srcSet).toContain('512w');
    expect(srcSet).toContain('1024w');
    expect(srcSet).toContain('width=256');
    expect(srcSet).toContain('width=512');
    expect(srcSet).toContain('width=1024');
  });

  it('generates srcset for non-Supabase URLs (unmodified)', () => {
    const baseUrl = 'https://example.com/photo.jpg';
    const srcSet = generateSrcSet(baseUrl);
    
    // Should still have the width descriptors
    expect(srcSet).toContain('256w');
    expect(srcSet).toContain('512w');
    expect(srcSet).toContain('1024w');
  });
});

describe('useLazyImage', () => {
  let mockObserver: {
    observe: jest.Mock;
    unobserve: jest.Mock;
    disconnect: jest.Mock;
  };

  beforeEach(() => {
    mockObserver = {
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    };

    // Mock IntersectionObserver
    (global as unknown as { IntersectionObserver: jest.Mock }).IntersectionObserver = jest.fn().mockImplementation((callback) => {
      // Store callback for testing
      (mockObserver as unknown as { _callback: (entries: { isIntersecting: boolean }[]) => void })._callback = callback;
      return mockObserver;
    });
  });

  it('returns early if ref.current is null', () => {
    const ref = { current: null };
    const result = useLazyImage(ref as React.RefObject<HTMLImageElement>, 'https://example.com/image.jpg');
    
    expect(result).toBeUndefined();
    expect(mockObserver.observe).not.toHaveBeenCalled();
  });

  it('observes the element when ref has current', () => {
    const element = document.createElement('img');
    const ref = { current: element };
    
    useLazyImage(ref as React.RefObject<HTMLImageElement>, 'https://example.com/image.jpg');
    
    expect(mockObserver.observe).toHaveBeenCalledWith(element);
  });

  it('sets src and unobserves when intersecting', () => {
    const element = document.createElement('img');
    const ref = { current: element };
    const src = 'https://example.com/image.jpg';
    
    useLazyImage(ref as React.RefObject<HTMLImageElement>, src);
    
    // Simulate intersection
    const callback = (mockObserver as unknown as { _callback: (entries: { isIntersecting: boolean; target: HTMLElement }[]) => void })._callback;
    callback([{ isIntersecting: true, target: element }]);
    
    expect(element.src).toBe(src);
    expect(mockObserver.unobserve).toHaveBeenCalledWith(element);
  });

  it('does not set src when not intersecting', () => {
    const element = document.createElement('img');
    const ref = { current: element };
    const src = 'https://example.com/image.jpg';
    
    useLazyImage(ref as React.RefObject<HTMLImageElement>, src);
    
    // Simulate non-intersection
    const callback = (mockObserver as unknown as { _callback: (entries: { isIntersecting: boolean; target: HTMLElement }[]) => void })._callback;
    callback([{ isIntersecting: false, target: element }]);
    
    expect(element.src).toBe('');
    expect(mockObserver.unobserve).not.toHaveBeenCalled();
  });

  it('returns cleanup function that unobserves', () => {
    const element = document.createElement('img');
    const ref = { current: element };
    
    const cleanup = useLazyImage(ref as React.RefObject<HTMLImageElement>, 'https://example.com/image.jpg');
    
    expect(typeof cleanup).toBe('function');
    
    if (cleanup) {
      cleanup();
      expect(mockObserver.unobserve).toHaveBeenCalledWith(element);
    }
  });

  it('cleanup handles null ref.current gracefully', () => {
    const element = document.createElement('img');
    const ref = { current: element } as React.RefObject<HTMLImageElement>;
    
    const cleanup = useLazyImage(ref, 'https://example.com/image.jpg');
    
    // Set current to null before cleanup
    (ref as { current: HTMLImageElement | null }).current = null;
    
    if (cleanup) {
      // Should not throw
      expect(() => cleanup()).not.toThrow();
    }
  });
});

