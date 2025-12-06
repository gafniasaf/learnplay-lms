export type FitMode = 'cover' | 'contain';

export const DESIRED_ASPECT = 16 / 9;
export const DEFAULT_TOLERANCE = 0.12; // ~12% deviation allowed before switching to contain

/**
 * Compute aspect ratio (w/h). Returns undefined if invalid.
 */
export function aspectRatioFromDimensions(width?: number, height?: number): number | undefined {
  if (!width || !height || width <= 0 || height <= 0) return undefined;
  return width / height;
}

/**
 * Decide cover vs contain based on how far the asset's ratio deviates from the desired ratio.
 * - If within tolerance, use 'cover' (full-bleed, minimal crop risk).
 * - If outside tolerance, use 'contain' (letterbox/pillarbox to avoid cropping content).
 */
export function fitModeFromRatio(ratio?: number, desired: number = DESIRED_ASPECT, tolerance: number = DEFAULT_TOLERANCE): FitMode {
  if (typeof ratio !== 'number' || !isFinite(ratio) || ratio <= 0) return 'cover';
  return Math.abs(ratio - desired) > tolerance ? 'contain' : 'cover';
}

/**
 * Convenience: given dimensions, compute ratio then return fit mode.
 */
export function fitModeFromDimensions(width?: number, height?: number, desired: number = DESIRED_ASPECT, tolerance: number = DEFAULT_TOLERANCE): FitMode {
  const ratio = aspectRatioFromDimensions(width, height);
  return fitModeFromRatio(ratio, desired, tolerance);
}
