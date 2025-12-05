# AI Pipeline Implementation Plan

## Overview
Transform the HTML mockup into a production-ready React application integrated with existing Supabase backend, job system, and realtime infrastructure.

---

## 🎯 Goals

1. **Replace** existing `/admin/courses/ai` (AIAuthor.tsx) with new `/admin/ai-pipeline` route
2. **Integrate** with existing job queue system (`ai_course_jobs`, `job_events`)
3. **Reuse** existing hooks (`useJobStatus`) and utilities
4. **Provide** transparent, discoverable course creation experience
5. **Maintain** backward compatibility during transition

---

## 📁 File Structure

```
src/
├── pages/
│   └── admin/
│       ├── AIPipeline.tsx                    # NEW - Main page route
│       └── AIAuthor.tsx                       # KEEP for now (legacy)
├── components/
│   └── admin/
│       └── pipeline/                          # NEW directory
│           ├── PipelineLayout.tsx            # Main 3-column layout
│           ├── TopNav.tsx                     # Navigation bar
│           ├── LeftSidebar/
│           │   ├── index.tsx                  # Sidebar container
│           │   ├── QuickStartPanel.tsx       # Course creation form
│           │   ├── ActiveJobsList.tsx        # Live job cards
│           │   └── RecentJobsList.tsx        # Completed jobs
│           ├── MainCanvas/
│           │   ├── index.tsx                  # Canvas container with tabs
│           │   ├── OverviewTab.tsx           # Job header, stepper, metrics, logs
│           │   ├── PhasesTab.tsx             # Phase accordion
│           │   ├── PromptsTab.tsx            # Prompt viewer (Phase 2)
│           │   └── OutputTab.tsx             # Course JSON preview
│           ├── RightInspector/
│           │   ├── index.tsx                  # Inspector container
│           │   ├── PhaseTimeline.tsx         # Vertical timeline
│           │   ├── LiveLogs.tsx              # Real-time log stream
│           │   └── SystemHealth.tsx          # Status indicators
│           └── shared/
│               ├── PhaseProgressStepper.tsx  # Horizontal stepper
│               ├── JobCard.tsx               # Reusable job card
│               ├── MetricCard.tsx            # Metric display
│               ├── LogEntry.tsx              # Single log entry
│               └── PhaseAccordion.tsx        # Expandable phase
├── hooks/
│   ├── useJobStatus.ts                       # EXISTING - Reuse as-is
│   ├── useJobsList.ts                        # NEW - Fetch active/recent jobs
│   ├── usePipelineJob.ts                     # NEW - Selected job details
│   └── useJobLogs.ts                         # NEW - Parse job events/summary
├── lib/
│   └── pipeline/
│       ├── jobParser.ts                      # NEW - Parse job summary JSON
│       ├── phaseExtractor.ts                 # NEW - Extract phase details
│       └── logFormatter.ts                   # NEW - Format logs for display
└── config/
    └── nav.ts                                 # UPDATE - Add pipeline route
```

---

## 🔄 Integration Points

### 1. **Database Tables** (Existing)
```sql
-- Main job tracking
ai_course_jobs (
  id, course_id, subject, grade, grade_band, 
  items_per_group, levels_count, mode, status,
  result_path, error, summary, created_by, created_at
)

-- Realtime events
job_events (
  id, job_id, status, step, progress, message, created_at
)

-- Course reviews (optional)
ai_course_reviews (
  id, job_id, issues, patch, suggestions, created_at
)
```

### 2. **Existing Hooks**
```typescript
// src/hooks/useJobStatus.ts
export function useJobStatus(jobId: string | null): {
  status: JobStatus | null;
}

interface JobStatus {
  jobId: string;
  state: string;    // queued|running|done|failed
  step: string;     // queued|generating|storage_write|catalog_update|verifying|done|failed
  progress: number; // 0-100
  message?: string;
  lastEventTime?: string | null;
}
```

### 3. **Edge Functions** (Existing)
- `generate-course`: Creates course with all 6 phases
- `review-course`: AI review/gating (Phase 3)
- `enqueue-course-media`: Async image generation (Phase 4)
- `ai-job-runner`: Processes pending jobs
- `job-status`: Fallback status polling

### 4. **Supabase Realtime**
```typescript
// Subscribe to job_events for live updates
supabase
  .channel(`job_events:${jobId}`)
  .on('postgres_changes', { 
    event: 'INSERT', 
    schema: 'public', 
    table: 'job_events',
    filter: `job_id=eq.${jobId}`
  }, handleEvent)
  .subscribe();
```

---

## 📋 Implementation Phases

### **Phase 1: Foundation & Routing** (Week 1)
**Goal**: Set up route, layout, and navigation

#### Tasks
1. ✅ Create new route `/admin/ai-pipeline`
2. ✅ Update `src/config/nav.ts` with new menu item
3. ✅ Create `PipelineLayout.tsx` with 3-column grid
4. ✅ Build `TopNav.tsx` with breadcrumb and actions
5. ✅ Add route to `App.tsx`

#### Files to Create
```typescript
// src/pages/admin/AIPipeline.tsx
import { PipelineLayout } from '@/components/admin/pipeline/PipelineLayout';

export default function AIPipeline() {
  return <PipelineLayout />;
}

// src/components/admin/pipeline/PipelineLayout.tsx
export function PipelineLayout() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  
  return (
    <div className="flex flex-col h-screen">
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar onJobSelect={setSelectedJobId} />
        <MainCanvas jobId={selectedJobId} />
        <RightInspector jobId={selectedJobId} />
      </div>
    </div>
  );
}
```

#### Integration
- Update `src/config/nav.ts`:
```typescript
{
  id: "ai-pipeline",
  label: "AI Pipeline",
  path: "/admin/ai-pipeline",
  icon: "Sparkles",
  roles: ["admin"]
}
```

---

### **Phase 2: Left Sidebar - Job Management** (Week 1-2)
**Goal**: Quick Start form and job list

#### Tasks
1. ✅ Create `QuickStartPanel.tsx` with form
2. ✅ Create `ActiveJobsList.tsx` with realtime updates
3. ✅ Create `RecentJobsList.tsx` with pagination
4. ✅ Build `useJobsList.ts` hook for fetching jobs
5. ✅ Implement job creation flow

#### Data Flow
```typescript
// src/hooks/useJobsList.ts
export function useJobsList(options?: {
  status?: 'pending' | 'running' | 'done' | 'failed';
  limit?: number;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  
  useEffect(() => {
    // Fetch jobs from ai_course_jobs
    const fetchJobs = async () => {
      let query = supabase
        .from('ai_course_jobs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (options?.status) {
        query = query.eq('status', options.status);
      }
      
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      
      const { data, error } = await query;
      if (data) setJobs(data);
    };
    
    fetchJobs();
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel('ai_course_jobs_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ai_course_jobs'
      }, () => fetchJobs())
      .subscribe();
    
    return () => { supabase.removeChannel(channel); };
  }, [options?.status, options?.limit]);
  
  return { jobs, loading, error };
}
```

#### Job Creation
```typescript
// In QuickStartPanel.tsx
const handleCreate = async (params: CourseParams) => {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data: job, error } = await supabase
    .from('ai_course_jobs')
    .insert({
      course_id: `${params.subject.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      subject: params.subject,
      grade: params.grade,
      grade_band: params.grade,
      items_per_group: params.itemsPerGroup,
      levels_count: params.levelsCount,
      mode: params.mode,
      status: 'pending',
      created_by: user!.id
    })
    .select()
    .single();
  
  if (job) {
    onJobSelect(job.id);
    toast.success('Course job created! Processing...');
  }
};
```

---

### **Phase 3: Main Canvas - Overview Tab** (Week 2)
**Goal**: Job details, phase stepper, metrics, activity log

#### Tasks
1. ✅ Create `OverviewTab.tsx` layout
2. ✅ Build `PhaseProgressStepper.tsx` component
3. ✅ Create `MetricCard.tsx` for key metrics
4. ✅ Implement activity log with filtering
5. ✅ Parse job `summary` field for details

#### Job Summary Parser
```typescript
// src/lib/pipeline/jobParser.ts
export interface JobSummary {
  phases: {
    [key: string]: {
      duration: number;
      aiCalls: number;
      itemsProcessed?: number;
      repairs?: RepairDetail[];
      errors?: string[];
    };
  };
  metrics: {
    totalItems: number;
    totalRepairs: number;
    totalAICalls: number;
    estimatedCost: number;
  };
  timeline: Array<{
    timestamp: string;
    phase: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
  }>;
}

export function parseJobSummary(summaryJson: string | null): JobSummary | null {
  if (!summaryJson) return null;
  try {
    return JSON.parse(summaryJson);
  } catch {
    return null;
  }
}
```

#### Phase Stepper Logic
```typescript
// In PhaseProgressStepper.tsx
const phases = [
  { id: 0, label: 'Generate', step: 'generating' },
  { id: 1, label: 'Validate', step: 'validating' },
  { id: 2, label: 'Repair', step: 'repairing' },
  { id: 3, label: 'Review', step: 'reviewing' },
  { id: 4, label: 'Images', step: 'images' },
  { id: 5, label: 'Enrich', step: 'enriching' }
];

const getPhaseStatus = (phase: number, currentStep: string): 'complete' | 'active' | 'pending' => {
  const stepOrder = ['generating', 'validating', 'repairing', 'reviewing', 'images', 'enriching'];
  const currentIndex = stepOrder.indexOf(currentStep);
  const phaseIndex = phase;
  
  if (phaseIndex < currentIndex) return 'complete';
  if (phaseIndex === currentIndex) return 'active';
  return 'pending';
};
```

---

### **Phase 4: Main Canvas - Phases Tab** (Week 3)
**Goal**: Detailed phase accordion with repairs and logs

#### Tasks
1. ✅ Create `PhasesTab.tsx` with accordion list
2. ✅ Build `PhaseAccordion.tsx` reusable component
3. ✅ Extract phase details from job summary
4. ✅ Display repair details for Phase 2
5. ✅ Add "View Prompt" and "Re-run Phase" actions

#### Phase Extractor
```typescript
// src/lib/pipeline/phaseExtractor.ts
export interface PhaseDetail {
  id: number;
  name: string;
  status: 'complete' | 'active' | 'pending' | 'failed';
  duration?: number;
  aiCalls?: number;
  summary: string;
  details: {
    itemsProcessed?: number;
    repairs?: Array<{
      itemId: number;
      issue: string;
      fix: string;
    }>;
    logs?: Array<{
      timestamp: string;
      message: string;
      type: 'info' | 'success' | 'warning' | 'error';
    }>;
  };
}

export function extractPhaseDetails(
  job: Job,
  summary: JobSummary | null,
  events: JobEvent[]
): PhaseDetail[] {
  // Combine data from job status, summary JSON, and events table
  const phases: PhaseDetail[] = [];
  
  // Phase 0: Generation
  phases.push({
    id: 0,
    name: 'Course Generation',
    status: determinePhaseStatus(0, job.status),
    duration: summary?.phases?.generation?.duration,
    aiCalls: summary?.phases?.generation?.aiCalls || 1,
    summary: `Generated ${summary?.metrics?.totalItems || 0} items`,
    details: {
      itemsProcessed: summary?.metrics?.totalItems,
      logs: events.filter(e => e.step === 'generating')
    }
  });
  
  // Phase 2: Repair
  phases.push({
    id: 2,
    name: 'Batched Repair',
    status: determinePhaseStatus(2, job.status),
    duration: summary?.phases?.repair?.duration,
    aiCalls: summary?.phases?.repair?.aiCalls || 0,
    summary: `Repaired ${summary?.metrics?.totalRepairs || 0} items`,
    details: {
      repairs: summary?.phases?.repair?.repairs || [],
      logs: events.filter(e => e.step === 'repairing')
    }
  });
  
  // ... other phases
  
  return phases;
}
```

#### Accordion Component
```typescript
// In PhaseAccordion.tsx
export function PhaseAccordion({ phase }: { phase: PhaseDetail }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
      >
        <div className="flex items-center gap-3">
          <PhaseStatusIcon status={phase.status} />
          <div>
            <h3 className="font-semibold">Phase {phase.id}: {phase.name}</h3>
            <p className="text-sm text-gray-600">
              {phase.duration ? `${phase.duration}s` : ''} · 
              AI Calls: {phase.aiCalls} · 
              {phase.summary}
            </p>
          </div>
        </div>
        <ChevronDown className={cn("transition-transform", isOpen && "rotate-180")} />
      </button>
      
      {isOpen && (
        <div className="p-4 border-t bg-gray-50">
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Summary</h4>
              <p className="text-sm">{phase.summary}</p>
            </div>
            
            {phase.details.repairs && phase.details.repairs.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Repairs Performed</h4>
                {phase.details.repairs.map((repair, idx) => (
                  <RepairCard key={idx} repair={repair} />
                ))}
              </div>
            )}
            
            {phase.details.logs && phase.details.logs.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Logs</h4>
                <LogList logs={phase.details.logs} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

### **Phase 5: Right Inspector - Live Monitoring** (Week 3)
**Goal**: Real-time phase timeline and log streaming

#### Tasks
1. ✅ Create `PhaseTimeline.tsx` vertical stepper
2. ✅ Build `LiveLogs.tsx` with auto-scroll
3. ✅ Create `SystemHealth.tsx` status display
4. ✅ Wire up to `useJobStatus` hook
5. ✅ Parse and format job events

#### Live Logs Component
```typescript
// In LiveLogs.tsx
export function LiveLogs({ jobId }: { jobId: string | null }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  
  useEffect(() => {
    if (!jobId) return;
    
    // Subscribe to job_events
    const channel = supabase
      .channel(`job_events_logs:${jobId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'job_events',
        filter: `job_id=eq.${jobId}`
      }, (payload) => {
        const event = payload.new as JobEvent;
        setLogs(prev => [...prev, formatLogEntry(event)]);
      })
      .subscribe();
    
    return () => { supabase.removeChannel(channel); };
  }, [jobId]);
  
  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);
  
  return (
    <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="text-white font-semibold">● Live</span>
        <div className="flex gap-2">
          <button onClick={() => setLogs([])} className="text-white/70 hover:text-white">
            Clear
          </button>
          <button 
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn("text-white/70 hover:text-white", autoScroll && "text-green-400")}
          >
            {autoScroll ? 'Auto' : 'Manual'}
          </button>
        </div>
      </div>
      <div className="max-h-[300px] overflow-y-auto space-y-1">
        {logs.map((log, idx) => (
          <LogLine key={idx} log={log} />
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

function formatLogEntry(event: JobEvent): LogEntry {
  const timestamp = new Date(event.created_at).toTimeString().slice(0, 8);
  const icon = getLogIcon(event.status);
  const color = getLogColor(event.status);
  
  return {
    timestamp,
    message: event.message || `${event.step}: ${event.status}`,
    icon,
    color
  };
}
```

#### Phase Timeline
```typescript
// In PhaseTimeline.tsx
export function PhaseTimeline({ jobId }: { jobId: string | null }) {
  const { status } = useJobStatus(jobId);
  
  const phases = useMemo(() => {
    return PHASES.map((phase, idx) => ({
      ...phase,
      status: getPhaseStatus(idx, status?.step || 'queued'),
      progress: idx === getCurrentPhaseIndex(status?.step) ? status?.progress : undefined
    }));
  }, [status]);
  
  return (
    <div className="relative pl-8">
      <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-200" />
      {phases.map((phase, idx) => (
        <TimelineStep key={idx} phase={phase} />
      ))}
    </div>
  );
}
```

---

### **Phase 6: Testing & Polish** (Week 4)
**Goal**: Ensure reliability and performance

#### Tasks
1. ✅ Write unit tests for all utilities
2. ✅ Create E2E tests for main workflows
3. ✅ Test real-time updates with multiple jobs
4. ✅ Performance optimization (memoization, virtualization)
5. ✅ Responsive design testing
6. ✅ Error boundary implementation

#### Unit Tests
```typescript
// src/lib/pipeline/jobParser.test.ts
describe('parseJobSummary', () => {
  it('should parse valid job summary JSON', () => {
    const json = JSON.stringify({
      phases: { generation: { duration: 12.3, aiCalls: 1 } },
      metrics: { totalItems: 48, totalRepairs: 3 }
    });
    
    const result = parseJobSummary(json);
    
    expect(result).toMatchObject({
      phases: { generation: { duration: 12.3 } },
      metrics: { totalItems: 48 }
    });
  });
  
  it('should return null for invalid JSON', () => {
    expect(parseJobSummary('invalid')).toBeNull();
    expect(parseJobSummary(null)).toBeNull();
  });
});
```

#### E2E Tests
```typescript
// tests/e2e/ai-pipeline.spec.ts
test('should create new course and monitor progress', async ({ page }) => {
  await page.goto('/admin/ai-pipeline');
  
  // Fill form
  await page.fill('[data-testid="subject-input"]', 'Fractions');
  await page.click('[data-testid="grade-3-5"]');
  await page.click('[data-testid="create-course-btn"]');
  
  // Should see job in active list
  await expect(page.locator('[data-testid="active-jobs"]')).toContainText('Fractions');
  
  // Should see phase stepper
  await expect(page.locator('[data-testid="phase-stepper"]')).toBeVisible();
  
  // Should see live logs
  await expect(page.locator('[data-testid="live-logs"]')).toContainText('Job started');
});

test('should view phase details in accordion', async ({ page }) => {
  await page.goto('/admin/ai-pipeline?job=test-job-id');
  await page.click('[data-testid="phases-tab"]');
  
  // Expand Phase 2
  await page.click('[data-testid="phase-2-header"]');
  
  // Should see repair details
  await expect(page.locator('[data-testid="phase-2-body"]')).toContainText('Repairs Performed');
});
```

---

## 🔌 Backend Integration Summary

### Required Backend Changes: **NONE**
All existing infrastructure is sufficient:
- ✅ `ai_course_jobs` table has all fields needed
- ✅ `job_events` table for realtime updates
- ✅ `summary` column in `ai_course_jobs` for detailed logs
- ✅ Edge functions are already deployed
- ✅ Realtime subscriptions are configured

### Optional Enhancements
1. **Structured summary field**: Update Edge Functions to write structured JSON to `summary` column
   ```typescript
   // In generate-course/index.ts
   const summary = {
     phases: {
       generation: { duration: genTime, aiCalls: 1, itemsProcessed: course.items.length },
       repair: { duration: repairTime, aiCalls: repairCount, repairs: repairDetails }
     },
     metrics: {
       totalItems: course.items.length,
       totalRepairs: repairDetails.length,
       totalAICalls: 1 + repairCount,
       estimatedCost: calculateCost()
     },
     timeline: events
   };
   
   await supabase
     .from('ai_course_jobs')
     .update({ summary: JSON.stringify(summary) })
     .eq('id', jobId);
   ```

2. **Phase-specific events**: Emit granular events to `job_events` for each phase milestone
   ```typescript
   await emitJobEvent(jobId, {
     status: 'info',
     step: 'repairing',
     progress: 50,
     message: `Repairing item ${itemId}: ${issue}`
   });
   ```

---

## 📊 Data Flow Diagram

```
User Input (QuickStartPanel)
    ↓
Create Job → ai_course_jobs (status: pending)
    ↓
Edge Function (generate-course) picks up job
    ↓
Phase 0: Generation → emit job_events
    ↓
Phase 1: Validation → emit job_events
    ↓
Phase 2: Repair → emit job_events → update summary
    ↓
Phase 3: Review → emit job_events
    ↓
Phase 4: Images (async) → enqueue-course-media
    ↓
Phase 5: Enrichment → update summary
    ↓
Complete → ai_course_jobs (status: done, result_path)
    ↓
UI Components:
    - useJobStatus → subscribes to job_events
    - useJobsList → fetches ai_course_jobs
    - usePipelineJob → fetches job details + summary
    - LiveLogs → subscribes to job_events
    - PhaseTimeline → derives from job_events + summary
```

---

## 🎨 Styling Strategy

### Use Existing Tailwind + shadcn/ui
All components should use:
- Tailwind CSS classes (already configured)
- shadcn/ui primitives: `Card`, `Button`, `Badge`, `Accordion`, `Progress`
- Existing design tokens from theme

### Component Library Mapping
```typescript
// HTML mockup → React components
<div className="panel"> → <Card>
<button className="btn-primary"> → <Button variant="default">
<span className="badge badge-success"> → <Badge variant="success">
<div className="phase-accordion"> → <Accordion>
<div className="progress-bar"> → <Progress value={percent}>
```

---

## 🚀 Deployment & Rollout Strategy

### Phase 1: Parallel Deployment (Week 1-3)
- Deploy new `/admin/ai-pipeline` route alongside existing `/admin/courses/ai`
- Add feature flag: `ENABLE_NEW_PIPELINE_UI`
- Only admins can access new UI initially
- Keep old UI as fallback

### Phase 2: Beta Testing (Week 4)
- Enable for internal team only
- Gather feedback on usability
- Monitor performance metrics
- Fix bugs and iterate

### Phase 3: Full Rollout (Week 5)
- Redirect `/admin/courses/ai` → `/admin/ai-pipeline`
- Update all internal links and documentation
- Remove old AIAuthor.tsx component
- Announce to all admin users

### Phase 4: Post-Launch (Week 6+)
- Monitor adoption metrics
- Implement Phase 2 features (prompt editing)
- Add analytics and usage tracking
- Plan advanced features (collaboration, A/B testing)

---

## ✅ Success Metrics

### Technical Metrics
- [ ] Page load time < 1s
- [ ] Real-time update latency < 500ms
- [ ] Support 10+ concurrent jobs without UI lag
- [ ] Zero data loss in log streaming
- [ ] 90%+ test coverage

### User Metrics
- [ ] 80%+ of users view prompts at least once
- [ ] 60%+ of users expand phase details for failed jobs
- [ ] Average time to create course < 3 minutes
- [ ] 50% reduction in error resolution time

### Business Metrics
- [ ] 100% of course creation moves to new UI
- [ ] Zero rollbacks to old UI
- [ ] Positive user feedback (>4/5 rating)
- [ ] Reduced support tickets for AI generation

---

## 🛠️ Development Checklist

### Week 1: Foundation
- [ ] Create route and navigation
- [ ] Build PipelineLayout component
- [ ] Implement TopNav component
- [ ] Setup basic styling with Tailwind
- [ ] Test routing and authentication

### Week 2: Left Sidebar + Overview
- [ ] QuickStartPanel with form validation
- [ ] ActiveJobsList with realtime updates
- [ ] RecentJobsList with pagination
- [ ] OverviewTab with job header
- [ ] PhaseProgressStepper component
- [ ] MetricCard components
- [ ] Activity log with filtering

### Week 3: Phases + Inspector
- [ ] PhasesTab with accordion
- [ ] PhaseAccordion reusable component
- [ ] Phase detail extraction logic
- [ ] PhaseTimeline vertical stepper
- [ ] LiveLogs with auto-scroll
- [ ] SystemHealth indicators
- [ ] Wire up useJobStatus hook

### Week 4: Testing + Polish
- [ ] Unit tests for utilities
- [ ] E2E tests for workflows
- [ ] Error boundaries
- [ ] Loading states
- [ ] Empty states
- [ ] Responsive design
- [ ] Performance optimization
- [ ] Documentation

---

## 📝 Code Review Checklist

Before merging each component:
- [ ] TypeScript types are correct and exported
- [ ] Component is tested (unit + E2E if applicable)
- [ ] Error handling is implemented
- [ ] Loading states are handled
- [ ] Responsive design works on mobile
- [ ] Accessibility (ARIA labels, keyboard nav)
- [ ] Performance (memoization, lazy loading)
- [ ] Code follows existing patterns
- [ ] No console.logs or debug code
- [ ] Documentation/comments for complex logic

---

## 🔧 Troubleshooting Guide

### Issue: Realtime updates not working
**Solution**: Check Supabase RLS policies on `job_events` table
```sql
-- Verify policy allows SELECT for authenticated users
SELECT * FROM pg_policies WHERE tablename = 'job_events';
```

### Issue: Job summary is null
**Solution**: Update Edge Functions to write structured summary
```typescript
// In generate-course/index.ts after job completion
await supabase
  .from('ai_course_jobs')
  .update({ summary: JSON.stringify(summaryObject) })
  .eq('id', jobId);
```

### Issue: Phase stepper shows wrong status
**Solution**: Verify step mapping logic matches Edge Function step names
```typescript
// Check that step names match exactly
const STEP_MAP = {
  'queued': 0,
  'generating': 0,
  'storage_write': 1,
  'catalog_update': 2,
  // ... etc
};
```

---

## 📚 Related Documentation

- [Job Queue Operations](./JOB_QUEUE_OPERATIONS.md)
- [Course AI Generation](../COURSE_AI_GENERATION.md)
- [Supabase Realtime Guide](https://supabase.com/docs/guides/realtime)
- [Original Design Plan](./AI_PIPELINE_DESIGN_PLAN.md) (created earlier)

---

## 🎯 Next Steps

1. **Review this plan** with team and stakeholders
2. **Allocate resources** (1 developer, 4 weeks)
3. **Create GitHub issues** for each phase
4. **Set up project board** with milestones
5. **Begin Phase 1 implementation**

Ready to start building! 🚀
