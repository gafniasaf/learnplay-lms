# AI Pipeline UX Redesign

## Current Issues

1. **Information Overload**: Too many panels competing for attention
2. **Poor Visual Hierarchy**: No clear primary action vs. secondary monitoring
3. **Stuck Jobs**: 22 queued jobs with no clear way to prioritize or manage
4. **Marketing Generator**: Disconnected from main workflow, unclear purpose
5. **Phase Timeline**: Shows all phases as "Waiting..." - not actionable
6. **Empty States**: Live logs empty, taking valuable space
7. **No Workflow Guidance**: Users don't know what to do next

## Design Principles

1. **Progressive Disclosure**: Show what's needed, hide complexity
2. **Action-Oriented**: Every element should have a clear purpose
3. **Real-Time Feedback**: Show progress, not just status
4. **Error Recovery**: Make it easy to fix problems
5. **Workflow Clarity**: Guide users through the process

## Proposed Redesign

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Header: AI Pipeline Dashboard                             │
│  [Quick Actions] [Filters] [Search]                        │
├──────────────┬──────────────────────────┬─────────────────┤
│              │                          │                 │
│  LEFT        │      MAIN CANVAS         │   RIGHT         │
│  SIDEBAR     │                          │   INSPECTOR     │
│              │                          │                 │
│  ┌────────┐  │  ┌────────────────────┐ │  ┌───────────┐ │
│  │ CREATE │  │  │  JOB DETAILS       │ │  │ STATUS    │ │
│  │ COURSE │  │  │  (Selected Job)     │ │  │ OVERVIEW  │ │
│  └────────┘  │  └────────────────────┘ │  └───────────┘ │
│              │                          │                 │
│  ┌────────┐  │  ┌────────────────────┐ │  ┌───────────┐ │
│  │ QUEUE  │  │  │  PHASE PROGRESS    │ │  │ METRICS  │ │
│  │ STATUS │  │  │  (Visual Timeline) │ │  │ & HEALTH │ │
│  └────────┘  │  └────────────────────┘ │  └───────────┘ │
│              │                          │                 │
│  ┌────────┐  │  ┌────────────────────┐ │                 │
│  │ ACTIVE │  │  │  OUTPUT PREVIEW    │ │                 │
│  │ JOBS   │  │  │  (Course Preview)  │ │                 │
│  └────────┘  │  └────────────────────┘ │                 │
│              │                          │                 │
└──────────────┴──────────────────────────┴─────────────────┘
```

### Key Changes

1. **Simplified Left Sidebar**
   - Collapsible sections
   - Quick Start at top (primary action)
   - Queue status summary (not full list)
   - Active jobs (only running/pending, max 5)

2. **Enhanced Main Canvas**
   - Job details when selected
   - Visual phase progress (not just text)
   - Output preview (course preview)
   - Action buttons (retry, cancel, view course)

3. **Smart Right Inspector**
   - Context-aware: Shows relevant info for selected job
   - Collapsible sections
   - System health only when needed
   - Live logs only when job is running

4. **Top Bar Actions**
   - Quick filters (status, date, type)
   - Search jobs
   - Bulk actions (retry failed, cancel queued)
   - Process queue button (prominent)

5. **Empty States**
   - Helpful guidance when no jobs
   - Templates/examples for course creation
   - Onboarding tips

6. **Error Handling**
   - Clear error messages
   - Retry buttons
   - Error details expandable
   - Fix suggestions

## Implementation Plan

1. Refactor LeftSidebar to be collapsible and focused
2. Enhance MainCanvas with better visualizations
3. Make RightInspector context-aware
4. Add top bar with filters and actions
5. Improve empty states and error handling
6. Add real-time updates and progress indicators


