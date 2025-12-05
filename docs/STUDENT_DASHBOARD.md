# Student Dashboard

## Overview

The Student Dashboard provides a motivating, student-friendly view of learning progress with clear next steps and actionable CTAs.

## Architecture

### Main Dashboard (`/student/dashboard`)

**Purpose:** Glanceable overview focused on motivation, continuation, and next actions.

**Components:**
1. **SummaryCardsStudent** - 4 KPI cards with sparklines and WoW deltas
   - Active Minutes (today/week/month)
   - Items Answered (today/week/month)
   - Accuracy (Excellent/Good/Practice badge)
   - Daily Goal (20 min target with progress)

2. **Day/Week/Month Toggle** - URL-persisted range via `?range=day|week|month`

3. **Status Pill** - "On Track" or "Keep Going" based on weekly goals (aria-live)

4. **Action Cards:**
   - **WeeklyGoalRing:** Radial progress (minutes + items combined %) with remaining counts
   - **NextUpCard:** Highest-priority assignment with due date and "Start Assignment" CTA
   - **ContinueCard:** Resume last course/level with deep link to `/play/:courseId?level=`
   - **RecentSessionsStudent:** Last 2-3 sessions (subject, duration, items, accuracy)
   - **AchievementsGlance:** Last 3 badges earned with "View all" link
   - **RecommendationsCard:** 1-2 practice suggestions with "Start Practice" CTA

5. **Due Today Banner:** Dismissible alert when assignments are due/overdue today

### Detail Pages

**Assignments (`/student/assignments`):**
- Full list with due dates, subject, priority
- Filters and search (if existing page supports)
- Start CTA per assignment

**Timeline (`/student/timeline`):**
- Chronological session history
- Filters: All | Mistakes | Mastered
- Date display and duration

**Achievements (`/student/achievements`):**
- Grid of all earned badges
- Earn date per badge
- Empty state: "Keep learning to earn badges!"

**Goals (`/student/goals`):**
- Weekly targets (read-only or student-editable)
- Progress bars for minutes and items
- Remaining counts
- Note: "Goals are set by your teacher"

## Features

### Range Selection
- `useStudentRange()` hook for URL state (`?range=`)
- Updates KPIs, sessions, achievements per range
- Date window calculation (day/week/month)

### Data Flow
```typescript
// Mock selectors (to be replaced with real APIs)
getStudentKpiData(window) → sparklines, deltas, totals
getAssignmentsDue(window) → due assignments
getRecentStudentSessions(window) → last sessions

// Live integrations
useStudentGoals(params) → weekly targets (Supabase `student-goals` edge function)
aggregateStudentGoalProgress(response) → UI-friendly progress totals
useStudentTimeline(params) → session history (Supabase `student-timeline` edge function)
mapStudentTimelineEventToSession(event) → UI session card data
useStudentAssignments() → upcoming assignments (Supabase `list-assignments-student` edge function)
mapStudentAssignment(record) → UI assignment card data
getStudentAchievements(window) → badges
getContinuePoint() → last course/level
```

### Deep Links
- **Continue:** `/play/:courseId?level=X` resumes exact point
- **Next Up:** `/student/assignments?highlight=:id` filters to that assignment
- **Recommendations:** `/play/:courseId?level=X` for suggested practice

### Empty States
- **No assignments:** "You're all caught up! 🎉"
- **No continue point:** "Start a new course" with Browse Courses CTA
- **No achievements:** "Keep learning to earn badges!"
- **No sessions:** "No sessions yet"

### Accessibility
- Tooltips explain metrics
- Radial progress has `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- Status pill uses `aria-live="polite"`
- All CTAs keyboard-accessible with focus rings
- Color-coded with non-color cues (icons, badges)

### Mobile Responsive
- Single column stack on mobile
- Segmented control scrollable if needed
- Continue CTA always above the fold
- Sub-nav becomes horizontal tabs

## UX Principles

1. **Motivating:** Badges, streaks, "You're all caught up!" messages
2. **Actionable:** Clear CTAs (Continue, Start Assignment, Start Practice)
3. **Progress-Focused:** Radial goal ring, sparklines, deltas show improvement
4. **Simple:** Daily goal (20 min) alongside weekly; minimal cognitive load
5. **Safe:** Empty states are encouraging, not discouraging

## Implementation

**Key Files:**
- `src/pages/student/Dashboard.tsx` - Main overview
- `src/pages/student/Goals.tsx` - Weekly goals view (live data aware)
- `src/pages/student/Timeline.tsx` - Timeline detail view (live data aware)
- `src/pages/student/Assignments.tsx` - Assignments detail view (live data aware)
- `src/hooks/useStudentRange.ts` - Range state management
- `src/hooks/useStudentGoals.ts` - React Query hook for `student-goals`
- `src/hooks/useStudentTimeline.ts` - React Query hook for `student-timeline`
- `src/hooks/useStudentAssignments.ts` - React Query hook for `list-assignments-student`
- `src/lib/student/mockSelectors.ts` - Data adapters
- `src/lib/student/goalsMappers.ts` - Aggregates API goals into UI totals
- `src/lib/student/timelineMappers.ts` - Maps timeline events into session cards
- `src/lib/student/assignmentsMappers.ts` - Maps assignments into UI cards
- `src/components/student/` - Reusable components

**Tests:**
- Jest: `useStudentRange.test.ts`, `WeeklyGoalRing.test.tsx`, `NextUpCard.test.tsx`, `ContinueCard.test.tsx`
- Jest: `StudentGoals.test.tsx`, `goalsMappers.test.ts`
- Jest: `StudentTimeline.test.tsx`, `timelineMappers.test.ts`
- Jest: `StudentAssignments.test.tsx`, `assignmentsMappers.test.ts`
- Coverage: All student components and hooks

## Future Enhancements

- Real-time data from Supabase
- Edge function-backed goals are now integrated; next step is to wire assignments timeline to live data
- Personalized AI recommendations
- Daily micro-goals student can set
- Progress animations on goal completion
- Social features (share achievements, leaderboards)

