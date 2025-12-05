# ADR 002: Adaptive Learning Algorithm

**Status:** Accepted  
**Date:** 2025-01-20  
**Deciders:** Product & Engineering

## Context

Students learn at different paces and need personalized practice. A fixed-order curriculum fails to adapt to individual mastery levels, leading to frustration (too hard) or boredom (too easy).

## Decision

We implement an **adaptive spaced-repetition algorithm** that dynamically adjusts question difficulty based on real-time performance.

### Core Algorithm

```
Pool Management:
┌────────────┐
│  Item Pool │ ← All course items
└─────┬──────┘
      │ Filter by level (if specified)
      ▼
┌──────────────┐
│ Active Pool  │ ← Items eligible for this session
└──────┬───────┘
       │
       ├─► Correct answer → Remove from pool (mastered)
       │
       └─► Wrong answer → Duplicate in pool (needs practice)
```

### Scoring Rules

```typescript
export const SCORE_RULES = {
  correct: 10,           // Base points for correct answer
  wrong: -5,             // Penalty for incorrect answer
  skip: 0,               // No penalty for skipping
  firstAttemptBonus: 5,  // Bonus for getting it right first try
  streakMultiplier: 1.2, // Multiplier per consecutive correct
  levelCompletionBonus: 50, // Bonus for mastering all items in level
} as const;
```

### Key Mechanisms

1. **Item Selection:**
   - Random selection from active pool (prevents pattern memorization)
   - Weighted by difficulty (harder items appear more often)
   - Level filtering (optional, for structured learning)

2. **Pool Updates:**
   - **Correct:** Item removed from pool → won't repeat this session
   - **Wrong:** Item duplicated in pool → higher chance of reappearance
   - **Skip:** Item remains in pool unchanged

3. **Progression Logic:**
   - Session ends when pool is empty (all items mastered)
   - OR user manually stops session
   - Progress saved: attempted items, mastery level, score

4. **Level Advancement:**
   - Automatic when current level pool exhausted
   - Manual override available (teacher/parent control)
   - Backward navigation allowed (review easier content)

## Consequences

### Positive

✅ **Personalization:** Each student gets unique practice path  
✅ **Efficiency:** Focus time on items needing practice  
✅ **Motivation:** Immediate feedback + visible progress  
✅ **Data-driven:** Performance metrics guide curriculum design  
✅ **Spaced repetition:** Wrong items return sooner (proven learning technique)

### Negative

❌ **Unpredictability:** Teachers can't preview exact question sequence  
❌ **Complexity:** Algorithm behavior harder to debug than fixed sequences  
❌ **Edge cases:** Very small item pools (< 5 items) may feel repetitive

## Implementation Details

### Pool Initialization
```typescript
export function initializePool(
  allItems: Item[],
  currentLevel: number | null,
  levels: Level[]
): Item[] {
  if (currentLevel === null) {
    return shuffleArray([...allItems]);
  }
  
  const level = levels.find(l => l.level === currentLevel);
  if (!level) return [];
  
  const filtered = allItems.filter(item => 
    level.itemIds.includes(item.id)
  );
  
  return shuffleArray(filtered);
}
```

### Pool Update Logic
```typescript
export function updatePoolAfterAttempt(
  currentPool: Item[],
  attemptedItem: Item,
  isCorrect: boolean
): Item[] {
  const remaining = currentPool.filter(
    item => item.id !== attemptedItem.id
  );
  
  if (isCorrect) {
    return remaining; // Mastered, remove
  } else {
    return [...remaining, attemptedItem]; // Wrong, add back
  }
}
```

### Score Calculation
```typescript
export function calculateScore(
  attempts: Attempt[],
  currentStreak: number,
  isFirstAttempt: boolean
): number {
  const baseScore = attempts.reduce((sum, a) => 
    sum + (a.correct ? SCORE_RULES.correct : SCORE_RULES.wrong),
    0
  );
  
  const streakBonus = currentStreak > 1 
    ? Math.floor(baseScore * SCORE_RULES.streakMultiplier)
    : 0;
  
  const firstBonus = isFirstAttempt && attempts[0]?.correct
    ? SCORE_RULES.firstAttemptBonus
    : 0;
  
  return Math.max(0, baseScore + streakBonus + firstBonus);
}
```

## Alternatives Considered

### Fixed Sequential Order
- ❌ No personalization
- ❌ Slow learners fall behind
- ❌ Fast learners get bored

### IRT-Based Difficulty Estimation
- ✅ More precise difficulty matching
- ❌ Requires large historical dataset
- ❌ Computationally expensive
- ❌ Overkill for our scale (hundreds of items per course)

### Leitner System (Spaced Repetition Cards)
- ✅ Proven for long-term retention
- ❌ Designed for flashcards, not interactive questions
- ❌ Requires multi-day sessions (we support single-session mastery)

## Testing Strategy

Key test scenarios covered:
- `adaptive.pool-init.test.ts` - Pool initialization with/without levels
- `adaptive.correct-removes-only-one.test.ts` - Correct answers remove exactly one instance
- `adaptive.wrong-duplicates-rotation.test.ts` - Wrong answers duplicate item in pool
- `adaptive.level-filter.test.ts` - Level filtering works correctly
- `adaptive.no-auto-advance-on-correct.test.ts` - No automatic level advancement

## Monitoring

Metrics to track:
- Average attempts per item (should be ~1.5-2.0)
- Pool exhaustion rate (% of students completing full session)
- Score distribution (should be normal curve)
- Streak length distribution
- Item difficulty calibration (some items consistently wrong → too hard)

## Future Enhancements

1. **Inter-session memory:** Remember mastered items across sessions
2. **Difficulty estimation:** ML model to predict item difficulty
3. **Time-based decay:** Items not seen in 7+ days return to pool
4. **Peer difficulty:** Show how other students performed on same items

## References

- [Spaced Repetition Research](https://en.wikipedia.org/wiki/Spaced_repetition)
- [Test Suite](../../src/lib/tests/adaptive.*.test.ts)
- [Game Logic Implementation](../../src/lib/gameLogic.ts)
