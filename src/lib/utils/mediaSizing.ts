/**
 * Media sizing constants and utilities for Play UI
 * Provides consistent sizing across stem and option components
 */

export const MEDIA_SIZES = {
  stem: {
    image: { 
      maxWidth: 300, 
      aspectRatio: '16/9', 
      quality: 85 
    },
    video: { 
      maxWidth: 300, 
      aspectRatio: '16/9' 
    },
    audio: { 
      width: '100%', 
      maxWidth: 280, 
      height: 48 
    },
    inline: { 
      maxWidth: 150, 
      maxHeight: 100 
    }
  },
  option: {
    image: {
      aspectRatio: '16/9',
      quality: 80
    },
    video: {
      aspectRatio: '16/9'
    },
    audio: {
      height: 60,
      width: '100%'
    }
  }
} as const;

export const BREAKPOINTS = {
  mobile: 480,
  tablet: 768,
  desktop: 1024
} as const;

export type Viewport = 'mobile' | 'tablet' | 'desktop';

/**
 * Get current viewport based on window width
 */
export function getViewport(): Viewport {
  if (typeof window === 'undefined') return 'desktop';
  
  const width = window.innerWidth;
  if (width < BREAKPOINTS.mobile) return 'mobile';
  if (width < BREAKPOINTS.tablet) return 'tablet';
  return 'desktop';
}

/**
 * Get responsive multiplier for media sizing
 */
export function getResponsiveMultiplier(viewport: Viewport): number {
  switch (viewport) {
    case 'mobile': return 0.6;
    case 'tablet': return 0.8;
    case 'desktop': return 1.0;
  }
}

/**
 * Calculate responsive media dimensions
 */
export function getResponsiveMediaSize(
  type: 'image' | 'video' | 'audio',
  context: 'stem' | 'option',
  viewport: Viewport
) {
  const baseSize = MEDIA_SIZES[context][type];
  const multiplier = getResponsiveMultiplier(viewport);
  
  if ('maxWidth' in baseSize) {
    return {
      ...baseSize,
      maxWidth: Math.floor(baseSize.maxWidth * multiplier)
    };
  }
  
  return baseSize;
}

/**
 * Type-safe getters for specific media properties
 */
export function getImageSizing(context: 'stem' | 'option', viewport: Viewport = 'desktop') {
  const baseSize = MEDIA_SIZES[context].image;
  const multiplier = getResponsiveMultiplier(viewport);
  
  if (context === 'stem' && 'maxWidth' in baseSize) {
    return {
      maxWidth: Math.floor(baseSize.maxWidth * multiplier),
      aspectRatio: baseSize.aspectRatio as '16/9',
      quality: baseSize.quality
    };
  }
  
  // Option context
  return {
    aspectRatio: baseSize.aspectRatio as '16/9',
    quality: baseSize.quality || 80
  };
}

export function getAudioSizing(context: 'stem' | 'option', viewport: Viewport = 'desktop') {
  const baseSize = MEDIA_SIZES[context].audio;
  const multiplier = getResponsiveMultiplier(viewport);
  
  if (context === 'stem' && 'maxWidth' in baseSize) {
    return {
      width: baseSize.width,
      maxWidth: Math.floor(baseSize.maxWidth * multiplier),
      height: baseSize.height
    };
  }
  
  // Option context
  return {
    height: baseSize.height,
    width: baseSize.width
  };
}

/**
 * Hook for responsive media sizing
 */
export function useResponsiveMediaSize(
  type: 'image' | 'video' | 'audio',
  context: 'stem' | 'option'
) {
  const [viewport, setViewport] = useState<Viewport>('desktop');
  
  useEffect(() => {
    const updateViewport = () => setViewport(getViewport());
    
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);
  
  return getResponsiveMediaSize(type, context, viewport);
}

/**
 * Type-safe hooks for specific media types
 */
export function useResponsiveImageSizing(context: 'stem' | 'option') {
  const [viewport, setViewport] = useState<Viewport>('desktop');
  
  useEffect(() => {
    const updateViewport = () => setViewport(getViewport());
    
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);
  
  return getImageSizing(context, viewport);
}

export function useResponsiveAudioSizing(context: 'stem' | 'option') {
  const [viewport, setViewport] = useState<Viewport>('desktop');
  
  useEffect(() => {
    const updateViewport = () => setViewport(getViewport());
    
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);
  
  return getAudioSizing(context, viewport);
}

/**
 * Recommended image widths for option tiles by viewport.
 */
export function getOptionImageTargetWidth(viewport: Viewport): number {
  switch (viewport) {
    case 'mobile': return 480;
    case 'tablet': return 640;
    case 'desktop': default: return 800;
  }
}

/**
 * Recommended thumbnail width for mixed text+media options
 */
export function getOptionThumbnailWidth(viewport: Viewport): number {
  switch (viewport) {
    case 'mobile': return 140;
    case 'tablet': return 160;
    case 'desktop': default: return 180;
  }
}

// Import React hooks
import { useState, useEffect } from 'react';
