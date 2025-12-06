# AI Pipeline Redesign V2 - From Scratch

## User Journey Analysis

### What users actually do:
1. **Create** - Fill form, submit course request
2. **Monitor** - Watch progress while AI generates (2-5 minutes)
3. **Review** - Check the generated course, make edits
4. **Publish** - Use the course

### What users DON'T need:
- ❌ Long list of all jobs (only care about current one)
- ❌ Complex phase breakdowns (just want "is it done?")
- ❌ System health metrics (not their concern)
- ❌ Historical job browsing (can go to separate page)

## New Design Philosophy

**Single Focus**: One job at a time, full attention on current task

**Progressive Disclosure**: Show only what's relevant NOW

**Action-Oriented**: Every screen has a clear primary action

## Proposed Layout

### State 1: No Active Job (Creation Mode)
```
┌─────────────────────────────────────────────────────┐
│  AI Course Generator                                │
│  Create engaging courses in minutes                │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │  Create New Course                            │  │
│  │                                                │  │
│  │  Subject: [________________]                  │  │
│  │  Grade:   [3-5 ▼]  Items: [12]                │  │
│  │  Mode:    [MCQ] [Numeric]                     │  │
│  │  Notes:   [________________]                  │  │
│  │                                                │  │
│  │  [✨ Generate Course] (primary button)        │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  Recent Courses (collapsed by default)              │
│  ┌──────────────────────────────────────────────┐  │
│  │  • Photosynthesis (completed 2h ago)         │  │
│  │  • Fractions (completed yesterday)          │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### State 2: Job Running (Progress Mode)
```
┌─────────────────────────────────────────────────────┐
│  Generating: Photosynthesis                         │
│  Started 2 minutes ago                              │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │  Progress: ████████░░░░░░░░ 45%              │  │
│  │                                                │  │
│  │  Current Step: Generating Content              │  │
│  │  ⏱️ Estimated time remaining: 3 minutes        │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  What's happening now:                              │
│  ┌──────────────────────────────────────────────┐  │
│  │  ✓ Generated course structure                 │  │
│  │  ✓ Created 12 practice items                  │  │
│  │  → Generating study materials...              │  │
│  │  ⏳ Creating images (3 remaining)              │  │
│  │  ⏳ Quality review pending                    │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  [Cancel Generation]                                │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### State 3: Job Complete (Result Mode)
```
┌─────────────────────────────────────────────────────┐
│  ✓ Course Generated: Photosynthesis                │
│  Completed 1 minute ago                             │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │  Preview                                      │  │
│  │  ┌────────────────────────────────────────┐  │  │
│  │  │  Course: Photosynthesis                │  │  │
│  │  │  Grade: 3-5                            │  │  │
│  │  │  12 practice items • 3 study texts      │  │  │
│  │  │  [View Full Course]                    │  │  │
│  │  └────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  Quick Actions:                                      │
│  [📝 Edit Course]  [👁️ Preview]  [🚀 Publish]      │
│                                                      │
│  [Create Another Course]                            │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Key Principles

1. **One Thing at a Time**: Show creation OR progress OR result, not all at once
2. **Clear Status**: Big, obvious progress indicator
3. **Actionable**: Every screen has clear next steps
4. **Minimal Distraction**: Hide everything not relevant to current task
5. **Fast Recovery**: Easy to cancel, retry, or start over

## Component Structure

### Main Component: `CourseGenerator`
- State machine: `idle` | `creating` | `complete`
- Shows appropriate view based on state

### Sub-components:
- `CreationForm` - Simple, focused form
- `ProgressView` - Real-time progress with ETA
- `ResultView` - Course preview with actions
- `RecentCourses` - Collapsible sidebar (only when idle)

## Benefits

- **Faster**: Less cognitive load, clear next steps
- **Clearer**: Always know what's happening
- **Focused**: No distractions from current task
- **Mobile-friendly**: Single column, scrollable

