/**
 * Client-Side Image Optimization
 * Reduces image sizes for faster loading without server changes
 */

/**
 * Generate optimized image URL with resize parameters
 * Works with Supabase Storage transform API
 * 
 * Default: 512x512 at 85% quality (reduces 1.5MB images to ~200KB)
 */
export function getOptimizedImageUrl(url: string, options: {
  width?: number;
  height?: number;
  quality?: number;
} = {}): string {
  const { width = 512, height = 512, quality = 85 } = options;
  
  // Skip optimization for non-Supabase URLs
  if (!url || !url.includes('supabase.co/storage')) {
    return url;
  }
  
  // Add transform parameters to Supabase Storage URL
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set('width', String(width));
    urlObj.searchParams.set('height', String(height));
    urlObj.searchParams.set('quality', String(quality));
    return urlObj.toString();
  } catch (error) {
    console.warn('Failed to optimize image URL:', error);
    return url;
  }
}

/**
 * Preload critical images
 */
export function preloadImage(url: string): void {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = url;
  document.head.appendChild(link);
}

/**
 * Generate srcset for responsive images
 */
export function generateSrcSet(baseUrl: string): string {
  return `
    ${getOptimizedImageUrl(baseUrl, { width: 256 })} 256w,
    ${getOptimizedImageUrl(baseUrl, { width: 512 })} 512w,
    ${getOptimizedImageUrl(baseUrl, { width: 1024 })} 1024w
  `.trim();
}

/**
 * Lazy load images with Intersection Observer
 */
export function useLazyImage(ref: React.RefObject<HTMLImageElement>, src: string) {
  if (!ref.current) return;
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && ref.current) {
        ref.current.src = src;
        observer.unobserve(ref.current);
      }
    });
  }, {
    rootMargin: '50px', // Start loading 50px before visible
  });
  
  observer.observe(ref.current);
  
  return () => {
    if (ref.current) observer.unobserve(ref.current);
  };
}

