# IgniteZero Migration Plan

## Current State: 68+ Direct Supabase Calls

Found direct database/storage calls that bypass MCP layer:

### By Priority

#### Phase 1: Core Job System (BLOCKING)
| File | Calls | Tables/Operations |
|------|-------|-------------------|
| `useJobQuota.ts` | 1 | `user_job_quota` view |
| `useJobsList.ts` | 1 | `ai_course_jobs` + realtime |
| `useJobContext.ts` | 2 | `ai_course_jobs` + realtime |
| `usePipelineJob.ts` | 2 | `ai_course_jobs` + realtime |
| `JobsDashboard.tsx` | 6 | `ai_course_jobs`, `ai_media_jobs`, metrics |
| `AIPipeline.tsx` | 2 | `ai_course_jobs` |
| `GenerateCourseForm.tsx` | 2 | `ai_course_jobs` |
| `QuickStartPanel.tsx` | 1 | `ai_course_jobs` |

**New Edge Functions Needed:**
- `list-course-jobs` - list/filter ai_course_jobs
- `get-course-job` - get single job with events
- `requeue-job` - requeue failed jobs
- `delete-job` - soft delete jobs
- `get-job-metrics` - aggregated metrics
- `get-job-events` - job event history

#### Phase 2: Media & Storage (IMPORTANT)
| File | Calls | Operations |
|------|-------|------------|
| `MediaManager.tsx` | 6+5 | storage + metadata |
| `CourseEditor.tsx` | 6+8 | storage + course_metadata |
| `StimulusPanel.tsx` | 4+2 | storage |
| `StimulusEditor.tsx` | 4+2 | storage |
| `StudyTextsEditor.tsx` | 1 | storage |

**New Edge Functions Needed:**
- `upload-media` - handle uploads with metadata
- `list-media` - list media with filtering
- `delete-media` - remove with cleanup

#### Phase 3: Tags & Admin (NICE TO HAVE)
| File | Calls | Tables |
|------|-------|--------|
| `TagApprovalQueue.tsx` | 5 | tag tables |
| `TagTypeManager.tsx` | 3 | tag tables |
| `TagValueEditor.tsx` | 3 | tag tables |
| `TagApprovalCard.tsx` | 1 | tag tables |

**New Edge Functions Needed:**
- `list-tags` - list tag types/values
- `approve-tag` - approve pending tags
- `manage-tag` - CRUD for tags

#### Phase 4: Messaging & Misc (LOW PRIORITY)
| File | Calls | Tables |
|------|-------|--------|
| `Inbox.tsx` | 2 | messages |
| `JoinClass.tsx` | 1 | class enrollment |
| `Assignments.tsx` | 3 | assignments + jobs |
| `Logs.tsx` | 1 | logs |
| `CourseVersionHistory.tsx` | 2 | version history |

---

## Migration Pattern

### Before (Direct Call)
```typescript
// ❌ Anti-pattern
const { data } = await supabase
  .from('ai_course_jobs')
  .select('*')
  .eq('status', 'pending');
```

### After (IgniteZero)
```typescript
// ✅ IgniteZero pattern
const { jobs } = await lms.listCourseJobs({ status: 'pending' });

// Or with useMCP hook
const { listCourseJobs } = useMCP();
const jobs = await listCourseJobs({ status: 'pending' });
```

---

## Realtime Subscriptions

Some hooks use Supabase realtime subscriptions. These need special handling:

```typescript
// ❌ Current - direct realtime
supabase
  .channel('jobs')
  .on('postgres_changes', { event: '*', table: 'ai_course_jobs' }, handler)
  .subscribe();

// ✅ IgniteZero - poll + edge function (simpler, works everywhere)
useEffect(() => {
  const poll = setInterval(() => lms.listCourseJobs(), 5000);
  return () => clearInterval(poll);
}, []);

// Or keep realtime but abstract it
const { jobs, loading } = useJobsRealtime({ status: 'pending' });
```

---

## Estimated Effort

| Phase | Files | Est. Hours | Priority |
|-------|-------|------------|----------|
| 1 - Jobs | 8 | 4-6h | CRITICAL |
| 2 - Media | 5 | 3-4h | HIGH |
| 3 - Tags | 4 | 2-3h | MEDIUM |
| 4 - Misc | 5 | 2-3h | LOW |
| **Total** | **22** | **11-16h** | - |

---

## Recommendation

**Start with Phase 1 (Jobs)** - this is what's breaking guest mode and is core to the admin experience. The pattern established here will apply to all other phases.

Would you like me to proceed with Phase 1?


