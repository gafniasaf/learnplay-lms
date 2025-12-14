/**
 * Tests for media sizing utilities
 */

import {
  MEDIA_SIZES,
  BREAKPOINTS,
  getViewport,
  getResponsiveMultiplier,
  getResponsiveMediaSize,
  getImageSizing,
  getAudioSizing,
  getOptionImageTargetWidth,
  getOptionThumbnailWidth,
  type Viewport,
} from '@/lib/utils/mediaSizing';

describe('mediaSizing', () => {
  describe('MEDIA_SIZES constants', () => {
    it('defines stem image sizes', () => {
      expect(MEDIA_SIZES.stem.image).toEqual({
        maxWidth: 300,
        aspectRatio: '16/9',
        quality: 85,
      });
    });

    it('defines stem audio sizes', () => {
      expect(MEDIA_SIZES.stem.audio).toEqual({
        width: '100%',
        maxWidth: 280,
        height: 48,
      });
    });

    it('defines option image sizes', () => {
      expect(MEDIA_SIZES.option.image).toEqual({
        aspectRatio: '16/9',
        quality: 80,
      });
    });
  });

  describe('BREAKPOINTS constants', () => {
    it('defines correct breakpoint values', () => {
      expect(BREAKPOINTS.mobile).toBe(480);
      expect(BREAKPOINTS.tablet).toBe(768);
      expect(BREAKPOINTS.desktop).toBe(1024);
    });
  });

  describe('getViewport', () => {
    beforeEach(() => {
      // Reset window.innerWidth
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });
    });

    it('returns desktop for width >= 1024', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      expect(getViewport()).toBe('desktop');

      Object.defineProperty(window, 'innerWidth', { value: 2000, writable: true, configurable: true });
      expect(getViewport()).toBe('desktop');
    });

    it('returns tablet for width >= 480 and < 768', () => {
      Object.defineProperty(window, 'innerWidth', { value: 600, writable: true, configurable: true });
      expect(getViewport()).toBe('tablet');

      Object.defineProperty(window, 'innerWidth', { value: 767, writable: true, configurable: true });
      expect(getViewport()).toBe('tablet');
    });

    it('returns mobile for width < 480', () => {
      Object.defineProperty(window, 'innerWidth', { value: 479, writable: true, configurable: true });
      expect(getViewport()).toBe('mobile');

      Object.defineProperty(window, 'innerWidth', { value: 320, writable: true, configurable: true });
      expect(getViewport()).toBe('mobile');
    });

    it('returns desktop in SSR environment', () => {
      const originalWindow = global.window;
      // @ts-expect-error - testing SSR scenario
      delete global.window;
      expect(getViewport()).toBe('desktop');
      global.window = originalWindow;
    });
  });

  describe('getResponsiveMultiplier', () => {
    it('returns 0.6 for mobile', () => {
      expect(getResponsiveMultiplier('mobile')).toBe(0.6);
    });

    it('returns 0.8 for tablet', () => {
      expect(getResponsiveMultiplier('tablet')).toBe(0.8);
    });

    it('returns 1.0 for desktop', () => {
      expect(getResponsiveMultiplier('desktop')).toBe(1.0);
    });
  });

  describe('getResponsiveMediaSize', () => {
    it('applies multiplier to stem image maxWidth', () => {
      const mobileSize = getResponsiveMediaSize('image', 'stem', 'mobile');
      expect(mobileSize.maxWidth).toBe(Math.floor(300 * 0.6)); // 180

      const tabletSize = getResponsiveMediaSize('image', 'stem', 'tablet');
      expect(tabletSize.maxWidth).toBe(Math.floor(300 * 0.8)); // 240

      const desktopSize = getResponsiveMediaSize('image', 'stem', 'desktop');
      expect(desktopSize.maxWidth).toBe(300);
    });

    it('preserves other properties when applying multiplier', () => {
      const size = getResponsiveMediaSize('image', 'stem', 'mobile');
      expect(size.aspectRatio).toBe('16/9');
      expect(size.quality).toBe(85);
    });

    it('returns option sizes without maxWidth unchanged', () => {
      const size = getResponsiveMediaSize('image', 'option', 'mobile');
      expect(size).toEqual({
        aspectRatio: '16/9',
        quality: 80,
      });
    });

    it('handles audio sizing correctly', () => {
      const stemSize = getResponsiveMediaSize('audio', 'stem', 'mobile');
      expect(stemSize.maxWidth).toBe(Math.floor(280 * 0.6));

      const optionSize = getResponsiveMediaSize('audio', 'option', 'mobile');
      expect(optionSize).toEqual({
        height: 60,
        width: '100%',
      });
    });
  });

  describe('getImageSizing', () => {
    it('returns stem image sizing with multiplier applied', () => {
      const mobile = getImageSizing('stem', 'mobile');
      expect(mobile.maxWidth).toBe(Math.floor(300 * 0.6));
      expect(mobile.aspectRatio).toBe('16/9');
      expect(mobile.quality).toBe(85);

      const desktop = getImageSizing('stem', 'desktop');
      expect(desktop.maxWidth).toBe(300);
    });

    it('returns option image sizing without maxWidth', () => {
      const sizing = getImageSizing('option', 'desktop');
      expect(sizing).toEqual({
        aspectRatio: '16/9',
        quality: 80,
      });
      expect(sizing).not.toHaveProperty('maxWidth');
    });

    it('defaults to desktop viewport', () => {
      const sizing = getImageSizing('stem');
      expect(sizing.maxWidth).toBe(300);
    });
  });

  describe('getAudioSizing', () => {
    it('returns stem audio sizing with multiplier applied', () => {
      const mobile = getAudioSizing('stem', 'mobile');
      expect(mobile.maxWidth).toBe(Math.floor(280 * 0.6));
      expect(mobile.width).toBe('100%');
      expect(mobile.height).toBe(48);

      const desktop = getAudioSizing('stem', 'desktop');
      expect(desktop.maxWidth).toBe(280);
    });

    it('returns option audio sizing without maxWidth', () => {
      const sizing = getAudioSizing('option', 'desktop');
      expect(sizing).toEqual({
        height: 60,
        width: '100%',
      });
      expect(sizing).not.toHaveProperty('maxWidth');
    });

    it('defaults to desktop viewport', () => {
      const sizing = getAudioSizing('stem');
      expect(sizing.maxWidth).toBe(280);
    });
  });

  describe('getOptionImageTargetWidth', () => {
    it('returns 480 for mobile', () => {
      expect(getOptionImageTargetWidth('mobile')).toBe(480);
    });

    it('returns 640 for tablet', () => {
      expect(getOptionImageTargetWidth('tablet')).toBe(640);
    });

    it('returns 800 for desktop', () => {
      expect(getOptionImageTargetWidth('desktop')).toBe(800);
    });
  });

  describe('getOptionThumbnailWidth', () => {
    it('returns 140 for mobile', () => {
      expect(getOptionThumbnailWidth('mobile')).toBe(140);
    });

    it('returns 160 for tablet', () => {
      expect(getOptionThumbnailWidth('tablet')).toBe(160);
    });

    it('returns 180 for desktop', () => {
      expect(getOptionThumbnailWidth('desktop')).toBe(180);
    });
  });
});


