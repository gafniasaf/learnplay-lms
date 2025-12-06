import { useEffect, useMemo } from 'react';

export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function seededRandom(seed: number) {
  let state = seed;
  return function() {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

export function shuffleArray<T>(array: T[], seed: string): T[] {
  const shuffled = [...array];
  const random = seededRandom(hashCode(seed));
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function useStableShuffle<T>(items: T[], seed: string) {
  return useMemo(() => shuffleArray(items, seed), [items, seed]);
}

export function useKeyboardGridNav(
  disabled: boolean,
  shuffledList: Array<{ originalIndex: number }>,
  buttonRefs: (HTMLButtonElement | null)[],
  onSelect: (originalIndex: number) => void,
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;
      const key = e.key;
      const currentFocus = document.activeElement;
      const currentIndex = buttonRefs.indexOf(currentFocus as HTMLButtonElement);
      if (key === 'ArrowRight' || key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % shuffledList.length;
        buttonRefs[nextIndex]?.focus();
      } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex <= 0 ? shuffledList.length - 1 : currentIndex - 1;
        buttonRefs[prevIndex]?.focus();
      } else if (key >= '1' && key <= String(shuffledList.length)) {
        e.preventDefault();
        const displayIndex = parseInt(key) - 1;
        onSelect(shuffledList[displayIndex].originalIndex);
      } else if ((key === 'Enter' || key === ' ') && currentIndex >= 0) {
        e.preventDefault();
        onSelect(shuffledList[currentIndex].originalIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, shuffledList, buttonRefs, onSelect]);
}
