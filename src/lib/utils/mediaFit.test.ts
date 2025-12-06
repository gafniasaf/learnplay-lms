import { aspectRatioFromDimensions, fitModeFromDimensions, fitModeFromRatio, DESIRED_ASPECT, DEFAULT_TOLERANCE } from './mediaFit';

describe('mediaFit utilities', () => {
  test('aspectRatioFromDimensions computes ratio', () => {
    expect(aspectRatioFromDimensions(1600, 900)).toBeCloseTo(16 / 9, 5);
    expect(aspectRatioFromDimensions(1000, 1000)).toBe(1);
    expect(aspectRatioFromDimensions(undefined, 1000)).toBeUndefined();
    expect(aspectRatioFromDimensions(0, 1000)).toBeUndefined();
  });

  test('fitModeFromRatio returns cover when within tolerance of 16:9', () => {
    const within = DESIRED_ASPECT + DEFAULT_TOLERANCE * 0.5; // within tolerance
    expect(fitModeFromRatio(within)).toBe('cover');
  });

  test('fitModeFromRatio returns contain when outside tolerance', () => {
    const outside = DESIRED_ASPECT + DEFAULT_TOLERANCE * 1.5; // outside tolerance
    expect(fitModeFromRatio(outside)).toBe('contain');
  });

  test('fitModeFromDimensions returns cover for exact 16:9', () => {
    expect(fitModeFromDimensions(1600, 900)).toBe('cover');
  });

  test('fitModeFromDimensions returns contain for square', () => {
    expect(fitModeFromDimensions(1000, 1000)).toBe('contain');
  });
});
