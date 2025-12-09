/**
 * Tests for image optimization utilities
 */

import {
  getOptimizedImageUrl,
  preloadImage,
  generateSrcSet,
} from '@/lib/utils/imageOptimizer';

describe('imageOptimizer', () => {
  beforeEach(() => {
    // Clear document.head
    document.head.innerHTML = '';
    jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getOptimizedImageUrl', () => {
    it('adds transform parameters to Supabase Storage URLs', () => {
      const url = 'https://example.supabase.co/storage/v1/object/public/bucket/image.jpg';
      const result = getOptimizedImageUrl(url, { width: 256, height: 256, quality: 80 });
      
      expect(result).toContain('width=256');
      expect(result).toContain('height=256');
      expect(result).toContain('quality=80');
      expect(result).toContain('supabase.co/storage');
    });

    it('uses default values when options not provided', () => {
      const url = 'https://example.supabase.co/storage/v1/object/public/bucket/image.jpg';
      const result = getOptimizedImageUrl(url);
      
      expect(result).toContain('width=512');
      expect(result).toContain('height=512');
      expect(result).toContain('quality=85');
    });

    it('preserves existing query parameters', () => {
      const url = 'https://example.supabase.co/storage/v1/object/public/bucket/image.jpg?existing=param';
      const result = getOptimizedImageUrl(url, { width: 256 });
      
      expect(result).toContain('existing=param');
      expect(result).toContain('width=256');
    });

    it('returns non-Supabase URLs unchanged', () => {
      const url = 'https://example.com/image.jpg';
      const result = getOptimizedImageUrl(url, { width: 256 });
      
      expect(result).toBe(url);
      expect(result).not.toContain('width=256');
    });

    it('handles URLs without supabase.co/storage', () => {
      const url = 'https://cdn.example.com/image.jpg';
      const result = getOptimizedImageUrl(url);
      expect(result).toBe(url);
    });

    it('handles empty URLs', () => {
      // Empty string returns empty (doesn't include 'supabase.co/storage')
      expect(getOptimizedImageUrl('')).toBe('');
    });

    it('handles invalid URLs gracefully', () => {
      // Invalid URLs that don't include 'supabase.co/storage' are returned as-is
      const invalidUrl = 'not-a-valid-url';
      const result = getOptimizedImageUrl(invalidUrl);
      expect(result).toBe(invalidUrl);
      
      // Test error handling path by mocking URL constructor to throw
      jest.clearAllMocks();
      const originalURL = global.URL;
      const mockError = new Error('Invalid URL');
      global.URL = jest.fn().mockImplementation(() => {
        throw mockError;
      }) as any;
      
      const supabaseUrl = 'https://example.supabase.co/storage/v1/object/public/bucket/image.jpg';
      const result2 = getOptimizedImageUrl(supabaseUrl);
      
      expect(console.warn).toHaveBeenCalledWith('Failed to optimize image URL:', mockError);
      expect(result2).toBe(supabaseUrl); // Should return original URL on error
      
      global.URL = originalURL;
    });

    it('handles URLs with hash fragments', () => {
      const url = 'https://example.supabase.co/storage/v1/object/public/bucket/image.jpg#fragment';
      const result = getOptimizedImageUrl(url, { width: 256 });
      
      expect(result).toContain('width=256');
      // Hash should be preserved
      expect(result).toContain('#fragment');
    });

    it('overwrites existing width/height/quality params', () => {
      const url = 'https://example.supabase.co/storage/v1/object/public/bucket/image.jpg?width=100&height=100&quality=50';
      const result = getOptimizedImageUrl(url, { width: 256, height: 256, quality: 80 });
      
      // Should have new values, not old ones
      expect(result).toContain('width=256');
      expect(result).toContain('height=256');
      expect(result).toContain('quality=80');
      expect(result).not.toContain('width=100');
    });
  });

  describe('preloadImage', () => {
    it('creates preload link element', () => {
      const url = 'https://example.com/image.jpg';
      preloadImage(url);
      
      const links = document.head.querySelectorAll('link[rel="preload"]');
      expect(links.length).toBeGreaterThan(0);
      const link = Array.from(links).find(l => l.getAttribute('href') === url);
      expect(link).toBeTruthy();
      expect(link?.getAttribute('href')).toBe(url);
      // Check both getAttribute and the property
      const asAttr = link?.getAttribute('as');
      const linkElement = link as HTMLLinkElement;
      // Either getAttribute or the property should be 'image'
      expect(asAttr === 'image' || linkElement.as === 'image').toBe(true);
    });

    it('appends multiple preload links', () => {
      preloadImage('image1.jpg');
      preloadImage('image2.jpg');
      
      const links = document.head.querySelectorAll('link[rel="preload"]');
      expect(links.length).toBe(2);
      expect(links[0]?.getAttribute('href')).toBe('image1.jpg');
      expect(links[1]?.getAttribute('href')).toBe('image2.jpg');
    });

    it('handles URLs with query parameters', () => {
      const url = 'https://example.com/image.jpg?width=256&quality=80';
      preloadImage(url);
      
      const link = document.head.querySelector('link[rel="preload"]');
      expect(link?.getAttribute('href')).toBe(url);
    });
  });

  describe('generateSrcSet', () => {
    it('generates srcset with multiple sizes', () => {
      const baseUrl = 'https://example.supabase.co/storage/v1/object/public/bucket/image.jpg';
      const srcSet = generateSrcSet(baseUrl);
      
      expect(srcSet).toContain('256w');
      expect(srcSet).toContain('512w');
      expect(srcSet).toContain('1024w');
    });

    it('uses optimized URLs for each size', () => {
      const baseUrl = 'https://example.supabase.co/storage/v1/object/public/bucket/image.jpg';
      const srcSet = generateSrcSet(baseUrl);
      
      // Each size should have width parameter
      expect(srcSet).toContain('width=256');
      expect(srcSet).toContain('width=512');
      expect(srcSet).toContain('width=1024');
    });

    it('formats srcset correctly', () => {
      const baseUrl = 'https://example.supabase.co/storage/v1/object/public/bucket/image.jpg';
      const srcSet = generateSrcSet(baseUrl);
      
      // Should have commas separating entries
      const entries = srcSet.split(',').map(s => s.trim());
      expect(entries.length).toBe(3);
      
      // Each entry should have width descriptor
      entries.forEach(entry => {
        expect(entry).toMatch(/\d+w$/);
      });
    });

    it('handles non-Supabase URLs', () => {
      const baseUrl = 'https://example.com/image.jpg';
      const srcSet = generateSrcSet(baseUrl);
      
      // Should still generate srcset, but URLs won't be optimized
      expect(srcSet).toContain('256w');
      expect(srcSet).toContain('512w');
      expect(srcSet).toContain('1024w');
    });

    it('trims whitespace from result', () => {
      const baseUrl = 'https://example.supabase.co/storage/v1/object/public/bucket/image.jpg';
      const srcSet = generateSrcSet(baseUrl);
      
      // Should not have leading/trailing whitespace
      expect(srcSet).toBe(srcSet.trim());
    });
  });
});

