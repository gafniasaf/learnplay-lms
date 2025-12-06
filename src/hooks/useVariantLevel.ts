/**
 * Hook for managing variant level selection
 * 
 * Provides:
 * - Current selected variant level
 * - Available levels from course config
 * - Level selector UI state
 * - Persistence to localStorage
 */

import { useState, useEffect } from 'react';
import type { VariantLevel } from '@/lib/types/courseVNext';
import { getDefaultVariantLevel, getAvailableVariantLevels, areVariantsUserSelectable } from '@/lib/utils/variantResolution';

const STORAGE_KEY = 'learnplay:variant-level';

export function useVariantLevel(course: any) {
  const defaultLevel = getDefaultVariantLevel(course);
  const availableLevels = getAvailableVariantLevels(course);
  const isUserSelectable = areVariantsUserSelectable(course);

  // Load from localStorage or use default
  const [selectedLevel, setSelectedLevel] = useState<VariantLevel>(() => {
    if (!isUserSelectable) {
      return defaultLevel;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate stored level exists in available levels
        const isValid = availableLevels.some(l => l.id === parsed);
        if (isValid) {
          return parsed as VariantLevel;
        }
      }
    } catch (err) {
      console.warn('Failed to load variant level from storage:', err);
    }

    return defaultLevel;
  });

  // Persist to localStorage when changed
  useEffect(() => {
    if (isUserSelectable) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedLevel));
      } catch (err) {
        console.warn('Failed to save variant level to storage:', err);
      }
    }
  }, [selectedLevel, isUserSelectable]);

  // If user selection is disabled, always use default
  const effectiveLevel = isUserSelectable ? selectedLevel : defaultLevel;

  return {
    selectedLevel: effectiveLevel,
    setSelectedLevel,
    availableLevels,
    isUserSelectable,
    defaultLevel,
  };
}

