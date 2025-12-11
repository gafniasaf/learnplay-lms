/**
 * Unit Tests: mediaSizing
 * Tests media sizing utilities and hooks
 */

import { renderHook, act } from '@testing-library/react';
import {
  MEDIA_SIZES,
  BREAKPOINTS,
  getViewport,
  getResponsiveMultiplier,
  getResponsiveMediaSize,
  getImageSizing,
  getAudioSizing,
  useResponsiveMediaSize,
  useResponsiveImageSizing,
  useResponsiveAudioSizing,
  getOptionImageTargetWidth,
  getOptionThumbnailWidth,
  Viewport,
} from '@/lib/utils/mediaSizing';

describe('MEDIA_SIZES', () => {
  it('has stem image configuration', () => {
    expect(MEDIA_SIZES.stem.image.maxWidth).toBe(300);
    expect(MEDIA_SIZES.stem.image.aspectRatio).toBe('16/9');
    expect(MEDIA_SIZES.stem.image.quality).toBe(85);
  });

  it('has option image configuration', () => {
    expect(MEDIA_SIZES.option.image.aspectRatio).toBe('16/9');
    expect(MEDIA_SIZES.option.image.quality).toBe(80);
  });

  it('has stem audio configuration', () => {
    expect(MEDIA_SIZES.stem.audio.maxWidth).toBe(280);
    expect(MEDIA_SIZES.stem.audio.height).toBe(48);
  });

  it('has option audio configuration', () => {
    expect(MEDIA_SIZES.option.audio.height).toBe(60);
    expect(MEDIA_SIZES.option.audio.width).toBe('100%');
  });
});

describe('BREAKPOINTS', () => {
  it('has correct breakpoint values', () => {
    expect(BREAKPOINTS.mobile).toBe(480);
    expect(BREAKPOINTS.tablet).toBe(768);
    expect(BREAKPOINTS.desktop).toBe(1024);
  });
});

describe('getViewport', () => {
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      value: originalInnerWidth,
      writable: true,
    });
  });

  it('returns mobile for small screens', () => {
    Object.defineProperty(window, 'innerWidth', { value: 400, writable: true });
    expect(getViewport()).toBe('mobile');
  });

  it('returns tablet for medium screens', () => {
    Object.defineProperty(window, 'innerWidth', { value: 600, writable: true });
    expect(getViewport()).toBe('tablet');
  });

  it('returns desktop for large screens', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
    expect(getViewport()).toBe('desktop');
  });

  it('returns desktop when window is undefined (SSR)', () => {
    const originalWindow = global.window;
    // @ts-expect-error - Testing SSR scenario
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
  it('scales stem image maxWidth for mobile', () => {
    const result = getResponsiveMediaSize('image', 'stem', 'mobile');
    expect(result).toHaveProperty('maxWidth');
    expect((result as { maxWidth: number }).maxWidth).toBe(Math.floor(300 * 0.6));
  });

  it('scales stem image maxWidth for tablet', () => {
    const result = getResponsiveMediaSize('image', 'stem', 'tablet');
    expect((result as { maxWidth: number }).maxWidth).toBe(Math.floor(300 * 0.8));
  });

  it('returns unscaled stem image for desktop', () => {
    const result = getResponsiveMediaSize('image', 'stem', 'desktop');
    expect((result as { maxWidth: number }).maxWidth).toBe(300);
  });

  it('returns option image sizing without maxWidth scaling', () => {
    const result = getResponsiveMediaSize('image', 'option', 'mobile');
    expect(result).toHaveProperty('aspectRatio');
    expect(result).not.toHaveProperty('maxWidth');
  });

  it('scales stem audio maxWidth', () => {
    const result = getResponsiveMediaSize('audio', 'stem', 'mobile');
    expect((result as { maxWidth: number }).maxWidth).toBe(Math.floor(280 * 0.6));
  });

  it('returns option audio sizing', () => {
    const result = getResponsiveMediaSize('audio', 'option', 'desktop');
    expect(result).toHaveProperty('height');
    expect(result).toHaveProperty('width');
  });

  it('scales stem video maxWidth', () => {
    const result = getResponsiveMediaSize('video', 'stem', 'tablet');
    expect((result as { maxWidth: number }).maxWidth).toBe(Math.floor(300 * 0.8));
  });
});

describe('getImageSizing', () => {
  it('returns stem image sizing with scaled maxWidth', () => {
    const result = getImageSizing('stem', 'mobile');
    expect(result.maxWidth).toBe(Math.floor(300 * 0.6));
    expect(result.aspectRatio).toBe('16/9');
    expect(result.quality).toBe(85);
  });

  it('returns option image sizing without maxWidth', () => {
    const result = getImageSizing('option', 'desktop');
    expect(result.aspectRatio).toBe('16/9');
    expect(result.quality).toBe(80);
    expect(result).not.toHaveProperty('maxWidth');
  });

  it('defaults to desktop viewport', () => {
    const result = getImageSizing('stem');
    expect(result.maxWidth).toBe(300);
  });
});

describe('getAudioSizing', () => {
  it('returns stem audio sizing with scaled maxWidth', () => {
    const result = getAudioSizing('stem', 'mobile');
    expect(result.maxWidth).toBe(Math.floor(280 * 0.6));
    expect(result.height).toBe(48);
    expect(result.width).toBe('100%');
  });

  it('returns option audio sizing without maxWidth', () => {
    const result = getAudioSizing('option', 'desktop');
    expect(result.height).toBe(60);
    expect(result.width).toBe('100%');
    expect(result).not.toHaveProperty('maxWidth');
  });

  it('defaults to desktop viewport', () => {
    const result = getAudioSizing('stem');
    expect(result.maxWidth).toBe(280);
  });
});

describe('useResponsiveMediaSize', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
  });

  it('returns desktop sizing initially', () => {
    const { result } = renderHook(() => useResponsiveMediaSize('image', 'stem'));
    expect((result.current as { maxWidth: number }).maxWidth).toBe(300);
  });

  it('updates on resize', () => {
    const { result } = renderHook(() => useResponsiveMediaSize('image', 'stem'));

    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 400, writable: true });
      window.dispatchEvent(new Event('resize'));
    });

    expect((result.current as { maxWidth: number }).maxWidth).toBe(Math.floor(300 * 0.6));
  });

  it('cleans up event listener on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useResponsiveMediaSize('image', 'stem'));
    
    unmount();
    
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});

describe('useResponsiveImageSizing', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
  });

  it('returns desktop image sizing initially', () => {
    const { result } = renderHook(() => useResponsiveImageSizing('stem'));
    expect(result.current.maxWidth).toBe(300);
    expect(result.current.aspectRatio).toBe('16/9');
  });

  it('returns option sizing without maxWidth', () => {
    const { result } = renderHook(() => useResponsiveImageSizing('option'));
    expect(result.current.aspectRatio).toBe('16/9');
    expect(result.current).not.toHaveProperty('maxWidth');
  });

  it('updates on resize to mobile', () => {
    const { result } = renderHook(() => useResponsiveImageSizing('stem'));

    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 400, writable: true });
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.maxWidth).toBe(Math.floor(300 * 0.6));
  });

  it('cleans up event listener on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useResponsiveImageSizing('stem'));
    
    unmount();
    
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});

describe('useResponsiveAudioSizing', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
  });

  it('returns desktop audio sizing initially', () => {
    const { result } = renderHook(() => useResponsiveAudioSizing('stem'));
    expect(result.current.maxWidth).toBe(280);
    expect(result.current.height).toBe(48);
  });

  it('returns option sizing without maxWidth', () => {
    const { result } = renderHook(() => useResponsiveAudioSizing('option'));
    expect(result.current.height).toBe(60);
    expect(result.current).not.toHaveProperty('maxWidth');
  });

  it('updates on resize to tablet', () => {
    const { result } = renderHook(() => useResponsiveAudioSizing('stem'));

    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 600, writable: true });
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.maxWidth).toBe(Math.floor(280 * 0.8));
  });

  it('cleans up event listener on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useResponsiveAudioSizing('stem'));
    
    unmount();
    
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    removeEventListenerSpy.mockRestore();
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


