# Parent Dashboard

## Overview

The Parent Dashboard provides an at-a-glance view of a child's learning progress with detailed drill-down pages for comprehensive analysis.

## Architecture

### Main Dashboard (`/parent/dashboard`)

**Purpose:** Glanceable overview without overwhelming parents with data.

**Components:**
1. **SummaryCards** - 4 KPI cards with sparklines and week-over-week deltas
   - Active Minutes (today/week/month breakdown)
   - Items Completed (today/week/month breakdown)
   - Accuracy (today's performance with Excellent/Good/Practice badge)
   - Learning Streak (consecutive days)

2. **Day/Week/Month Toggle** - Controls time range for all glance cards via URL query `?range=day|week|month`

3. **Glance Cards** (4 cards with CTAs to detail pages):
   - **SubjectTimeGlance:** Mini donut chart + top 3 subjects list → `/parent/subjects`
   - **TopicsGlance:** Last 3 topics with status chips (New/Practicing/Mastered) → `/parent/topics`
   - **ActivityGlance:** Last 2 sessions with time/accuracy → `/parent/timeline`
   - **GoalsGlance:** Weekly goal progress bars (minutes/items) → `/parent/goals`

### Detail Pages

**Subjects (`/parent/subjects`):**
- Full SubjectTimeChart with week-over-week comparison
- Filters: time range, subject selector
- Export CSV functionality

**Topics (`/parent/topics`):**
- Full table with Day/Week/Month tabs
- Columns: Date, Subject, Topic, Minutes, Items, Accuracy, Status
- Search and subject filters
- Pagination for long lists

**Timeline (`/parent/timeline`):**
- Chronological session timeline
- Date picker and quick filters (All/Mistakes/Mastered)
- Session detail panel on click

**Goals (`/parent/goals`):**
- Editable weekly targets (minutes/items)
- Alerts panel with actionable recommendations
- Week vs last week comparison

## Features

### Range Selection
- Uses `useParentRange()` hook for URL-persisted state
- Changes `?range=` param and updates all components
- Date window calculation for day/week/month

### Data Flow
```typescript
// Live integrations (Supabase edge functions via React Query)
useParentDashboard(params) → summary + child metrics
useParentSubjects(params) → subject performance table
useParentTopics(params) → topic mastery list
useParentTimeline(params) → learning sessions history
useParentGoals(params) → weekly goals + aggregates
```

### Accessibility
- Tooltips explain metrics ("Active minutes = on-task time")
- Focus rings on all interactive elements
- ARIA labels on charts and progress bars
- Keyboard navigation throughout
- Color-coded with semantic meaning (green/amber/red)

### Mobile Responsive
- Desktop: Multi-column grid (4 KPIs, 2x2 glance cards)
- Tablet: 2-column layouts
- Mobile: Single column stack; horizontal scrollable sub-nav

## UX Principles

1. **Not Overwhelming:** Main dashboard shows summaries only; detail pages have full data
2. **Clear CTAs:** Every glance card has "View details/timeline/topics/goals" link
3. **Progressive Disclosure:** Start with high-level metrics; drill down as needed
4. **Actionable Insights:** "What's Next" recommendations; goal progress with remaining counts
5. **Visual Clarity:** Icons, tooltips, color-coded badges; minimal cognitive load

## Implementation

**Key Files:**
- `src/pages/parent/Dashboard.tsx` - Main overview page (live data aware)
- `src/pages/parent/Goals.tsx` - Weekly goals view (live data aware)
- `src/pages/parent/Subjects.tsx` - Subject performance view (live data aware)
- `src/pages/parent/Topics.tsx` - Topic insights view (live data aware)
- `src/pages/parent/Timeline.tsx` - Activity timeline (live data aware)
- `src/components/parent/ParentSummaryCards.tsx` - KPI summary grid
- `src/components/parent/ActivityGlance.tsx` / `TopicsGlance.tsx` / `SubjectTimeGlance.tsx` - Glance cards
- `src/hooks/useParentDashboard.ts`, `useParentGoals.ts`, `useParentSubjects.ts`, `useParentTimeline.ts`, `useParentTopics.ts` - React Query hooks
- `src/lib/api/parentDashboard.ts`, `parentGoals.ts`, `parentSubjects.ts`, `parentTimeline.ts`, `parentTopics.ts` - Edge function clients
- `src/lib/parent/subjectsMappers.ts`, `timelineMappers.ts` - Response mappers

**Tests:**
- Jest: `src/pages/parent/__tests__/Dashboard.test.tsx`
- Jest: `src/pages/parent/__tests__/Goals.test.tsx`
- Jest: `src/pages/parent/__tests__/Subjects.test.tsx`
- Jest: `src/pages/parent/__tests__/Topics.test.tsx`
- Jest: `src/pages/parent/__tests__/Timeline.test.tsx`
- Jest: `src/lib/parent/__tests__/subjectsMappers.test.ts` (planned)
- Jest: `src/lib/parent/__tests__/timelineMappers.test.ts` (planned)
- Coverage: Parent dashboard pages, hooks, and mappers

## Future Enhancements

- Improve data richness and fidelity from Supabase (more KPIs, better subject/topic labeling)
- Multi-child support with child switcher
- Weekly/monthly email reports
- Calendar heatmap for daily activity
- Comparison vs class/grade averages
- AI-powered insights and recommendations

