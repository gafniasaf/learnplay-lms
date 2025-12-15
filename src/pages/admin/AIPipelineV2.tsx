/**
 * AI Pipeline V2 - Complete Redesign
 * 
 * Focus: Single job at a time, clear workflow
 * States: idle (create) | creating (progress) | complete (result)
 */

import { useState, useEffect, useRef } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMCP } from '@/hooks/useMCP';
import { useJobContext } from '@/hooks/useJobContext';
import { useJobsList } from '@/hooks/useJobsList';
import { useAuth } from '@/hooks/useAuth';
import { createLogger } from '@/lib/logger';
import { getCourseJob } from '@/lib/api/jobs';
import { isDevAgentMode } from '@/lib/api/common';

const logger = createLogger('AIPipelineV2');
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  X, 
  Eye, 
  Edit, 
  Rocket,
  Clock,
  AlertCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

type GeneratorState = 'idle' | 'creating' | 'complete';

const GRADE_OPTIONS = ['K-2', '3-5', '6-8', '9-12', 'College', 'All'];
const MODE_OPTIONS = [
  { value: 'options', label: 'MCQ', icon: '📝' },
  { value: 'numeric', label: 'Numeric', icon: '🔢' }
] as const;

// UX: AI pipeline should open clean by default.
// Only resume a job automatically if it's *recent* and still running.
const AUTO_RESUME_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

function slugifyCourseId(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `course`;
}

export default function AIPipelineV2() {
  const [state, setState] = useState<GeneratorState>('idle');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [currentCourseId, setCurrentCourseId] = useState<string | null>(null); // Store courseId locally
  const [resumeCandidate, setResumeCandidate] = useState<{ jobId: string; courseId: string | null } | null>(null);
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('3-5');
  const [itemsPerGroup, setItemsPerGroup] = useState(12);
  const [mode, setMode] = useState<'options' | 'numeric'>('options');
  const [specialRequests, setSpecialRequests] = useState('');
  const [creating, setCreating] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  
  const { enqueueJob } = useMCP();
  const { job, events, loading: jobLoading } = useJobContext(currentJobId);
  const { jobs: recentJobs } = useJobsList({ limit: 5, status: 'done' });
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const devAgent = isDevAgentMode();

  // Track when the user started watching the current job.
  // We use this (not job.created_at) to avoid false "pending for a while" warnings
  // caused by timestamp parsing, stale job snapshots, or eventual-consistency delays.
  const pendingSinceRef = useRef<{ jobId: string | null; startedAtMs: number }>({
    jobId: null,
    startedAtMs: Date.now(),
  });

  useEffect(() => {
    if (!currentJobId) return;
    if (pendingSinceRef.current.jobId !== currentJobId) {
      pendingSinceRef.current = { jobId: currentJobId, startedAtMs: Date.now() };
    }
  }, [currentJobId]);

  // Check for in-progress jobs on mount.
  // UX: always open clean. If a recent running job exists, offer an explicit "Resume" button.
  useEffect(() => {
    const storedJobId =
      (() => {
        try { return window.sessionStorage.getItem('selectedJobId'); } catch { return null; }
      })() ??
      (() => {
        try { return window.localStorage.getItem('selectedJobId'); } catch { return null; }
      })();

    const storedCourseId =
      (() => {
        try { return window.sessionStorage.getItem('selectedCourseId'); } catch { return null; }
      })() ??
      (() => {
        try { return window.localStorage.getItem('selectedCourseId'); } catch { return null; }
      })();

    if (!storedJobId) return;

    const clearStored = () => {
      try { window.sessionStorage.removeItem('selectedJobId'); } catch {}
      try { window.sessionStorage.removeItem('selectedCourseId'); } catch {}
      try { window.localStorage.removeItem('selectedJobId'); } catch {}
      try { window.localStorage.removeItem('selectedCourseId'); } catch {}
    };

    const checkJobStatus = async () => {
      try {
        const res = await getCourseJob(storedJobId, false);
        const job = (res as any)?.job as { status?: string; created_at?: string; course_id?: string } | undefined;
        if (!res?.ok || !job?.status || !job?.created_at) {
          clearStored();
          return;
        }

        const createdAt = new Date(job.created_at).getTime();
        const ageMs = Date.now() - createdAt;
        const isRunning = ['pending', 'processing', 'running'].includes(job.status);

        // Only offer resume if it's running and recent.
        if (isRunning && ageMs <= AUTO_RESUME_MAX_AGE_MS) {
          const courseId = storedCourseId || job.course_id || null;
          setResumeCandidate({ jobId: storedJobId, courseId });
          // Clean start page: don't keep auto-restoring forever.
          clearStored();
          return;
        }

        // Otherwise, always open clean.
        clearStored();
      } catch {
        // If we can't load the job, clear and open clean.
        clearStored();
      }
    };

    void checkJobStatus();
  }, []);

  // Auto-detect state from job status
  // Key UX rule: Don't show completed jobs on page load - show creation form instead
  useEffect(() => {
    if (!currentJobId) {
      setState('idle');
      return;
    }

    if (job) {
      // Update courseId from job if available
      if (job.course_id && !currentCourseId) {
        setCurrentCourseId(job.course_id);
        // Persist in-session only (avoid surprising auto-resume on a fresh load).
        try { sessionStorage.setItem('selectedCourseId', job.course_id); } catch {}
      }
      
      if (job.status === 'done') {
        // Check if this is a restored job from localStorage (page load)
        // vs a job that just completed while user was watching
        const wasWatching = state === 'creating';
        
        if (wasWatching) {
          // Job just completed while user was watching - show completion
          setState('complete');
          toast.success('Course generation complete!');
        } else {
          // This is a restored completed job from localStorage on page load
          // Clear it and show the creation form instead
          try { sessionStorage.removeItem('selectedJobId'); } catch {}
          try { sessionStorage.removeItem('selectedCourseId'); } catch {}
          try { localStorage.removeItem('selectedJobId'); } catch {}
          try { localStorage.removeItem('selectedCourseId'); } catch {}
          setCurrentJobId(null);
          setCurrentCourseId(null);
          setState('idle');
        }
      } else if (['pending', 'processing', 'running'].includes(job.status)) {
        setState('creating');
      } else if (job.status === 'failed') {
        setState('idle'); // Reset on failure
        toast.error('Course generation failed. Please try again.');
        setCurrentJobId(null);
        setCurrentCourseId(null);
        try { sessionStorage.removeItem('selectedJobId'); } catch {}
        try { sessionStorage.removeItem('selectedCourseId'); } catch {}
        try { localStorage.removeItem('selectedJobId'); } catch {}
        try { localStorage.removeItem('selectedCourseId'); } catch {}
      }
    } else if (currentJobId) {
      // Job ID exists but job data not loaded yet - stay in creating state
      setState('creating');
    }
  }, [job, currentJobId, currentCourseId, state]);

  const handleCreate = async () => {
    if (!subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }

    // Check authentication before attempting to create
    if (!devAgent && !user && !authLoading) {
      setAuthError('Please log in to create courses');
      toast.error('Authentication required', {
        description: 'Please log in to create courses',
        action: {
          label: 'Log In',
          onClick: () => navigate('/auth'),
        },
      });
      return;
    }

    setAuthError(null);
    setCreating(true);
    try {
      const courseId = `${slugifyCourseId(subject)}-${Date.now()}`;
      const result = await enqueueJob('ai_course_generate', {
        course_id: courseId,
        subject: subject.trim(),
        grade,
        grade_band: grade,
        items_per_group: itemsPerGroup,
        mode,
        notes: specialRequests.trim() || undefined,
      });

      if (result.ok) {
        const jobId = result.jobId as string;
        setCurrentJobId(jobId);
        setCurrentCourseId(courseId); // Store courseId for later use
        // Persist in-session only (avoid surprising auto-resume on a fresh load).
        try { sessionStorage.setItem('selectedJobId', jobId); } catch {}
        try { sessionStorage.setItem('selectedCourseId', courseId); } catch {}
        setState('creating');
        setSubject('');
        setSpecialRequests('');
        toast.success('Course generation started!');
      } else {
        throw new Error(result.error || 'Failed to create job');
      }
    } catch (err) {
      logger.error('Course creation failed', err instanceof Error ? err : new Error(String(err)), { action: 'createCourse' });
      const errorMessage = err instanceof Error ? err.message : 'Failed to create course';
      
      // Check if it's an authentication error
      if (errorMessage.includes('Authentication') || errorMessage.includes('log in') || errorMessage.includes('401')) {
        setAuthError(errorMessage);
        toast.error('Authentication required', {
          description: errorMessage,
          action: {
            label: 'Log In',
            onClick: () => navigate('/auth'),
          },
        });
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async () => {
    if (!currentJobId || !job) return;
    if (confirm('Cancel course generation? This cannot be undone.')) {
      setCurrentJobId(null);
      setCurrentCourseId(null);
      setState('idle');
      toast.info('Generation cancelled');
      // Ensure refresh/opening returns to clean start page
      try { sessionStorage.removeItem('selectedJobId'); } catch {}
      try { sessionStorage.removeItem('selectedCourseId'); } catch {}
      try { localStorage.removeItem('selectedJobId'); } catch {}
      try { localStorage.removeItem('selectedCourseId'); } catch {}
    }
  };

  const handleViewCourse = () => {
    // Try multiple sources for courseId: local state, job object, or job result
    let courseId: string | undefined = currentCourseId || job?.course_id;
    
    // Check job result if available (result is Record<string, unknown>)
    if (!courseId && job?.summary && typeof job.summary === 'object') {
      const summary = job.summary as Record<string, unknown>;
      courseId = summary.course_id as string | undefined;
    }
    
    // Extract from result_path if it contains a course ID pattern
    if (!courseId && job?.result_path) {
      const match = job.result_path.match(/courses\/([^/]+)/);
      courseId = match?.[1];
    }
    
    if (courseId && courseId !== 'ai_course_generate') { // Guard against job type being used as courseId
      // Use the correct route: /admin/editor/:courseId
      navigate(`/admin/editor/${courseId}`);
    } else {
      toast.error('Course ID not found', {
        description: 'The course ID could not be extracted from the job. The course may still be generating. Please wait for completion.',
      });
    }
  };

  const handleCreateAnother = () => {
    setCurrentJobId(null);
    setCurrentCourseId(null);
    try { sessionStorage.removeItem('selectedJobId'); } catch {}
    try { sessionStorage.removeItem('selectedCourseId'); } catch {}
    try { localStorage.removeItem('selectedJobId'); } catch {}
    try { localStorage.removeItem('selectedCourseId'); } catch {}
    setState('idle');
  };

  const jobProgressPercent = (() => {
    const raw = (job as any)?.progress_percent;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, Math.round(n)));
  })();

  // Calculate progress
  const progress = (() => {
    if (jobProgressPercent != null) return jobProgressPercent;
    if (!job || !events) return 0;
    // Fallback: derive from coarse event steps (when progress fields aren't available).
    const phases = ['generating', 'validating', 'repairing', 'reviewing', 'images', 'enriching'];
    const completed = phases.filter(p => events.some(e => e.step === p)).length;
    return Math.round((completed / phases.length) * 100);
  })();

  const currentPhase = (() => {
    const msg = (job as any)?.progress_message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
    const stage = (job as any)?.progress_stage;
    if (typeof stage === 'string' && stage.trim()) {
      const s = stage.trim();
      const stageNames: Record<string, string> = {
        planning: 'Initializing…',
        deterministic: 'Generating Content',
        building_skeleton: 'Generating Content',
        filling_content: 'Generating Content',
        validating: 'Validating Structure',
        repairing: 'Fixing Issues',
        reviewing: 'Quality Review',
        images: 'Creating Images',
        enriching: 'Enriching Content',
        persisting: 'Saving Course',
        completed: 'Done',
        failed: 'Failed',
      };
      return stageNames[s] || s.replace(/_/g, ' ');
    }
    if (!events || events.length === 0) return 'Initializing...';
    const lastEvent = events[events.length - 1];
    const phaseNames: Record<string, string> = {
      generating: 'Generating Content',
      validating: 'Validating Structure',
      repairing: 'Fixing Issues',
      reviewing: 'Quality Review',
      images: 'Creating Images',
      enriching: 'Enriching Content',
    };
    return phaseNames[lastEvent.step] || 'Processing...';
  })();

  // Only show "runner may not be active" when it's *actually* stuck.
  // There is a normal short gap right after enqueue where status can be 'pending' and events can be empty.
  const showPendingStuckWarning = (() => {
    if (!job) return false;
    if (job.status !== 'pending') return false;
    if (events.length > 0) return false;
    const ageMs = Date.now() - pendingSinceRef.current.startedAtMs;
    // Grace period: don't warn unless we've observed "pending with no events" for > 90s.
    return Number.isFinite(ageMs) && ageMs > 90_000;
  })();

  return (
    <PageContainer className="max-w-4xl mx-auto py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2">AI Course Generator</h1>
        <p className="text-muted-foreground">
          Create engaging courses in minutes
        </p>
      </div>

      {/* State: Idle - Creation Form */}
      {state === 'idle' && (
        <div className="space-y-6">
          {/* Resume Candidate (explicit; no silent auto-resume) */}
          {resumeCandidate && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>A recent course generation is still running. Resume it?</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCurrentJobId(resumeCandidate.jobId);
                    if (resumeCandidate.courseId) setCurrentCourseId(resumeCandidate.courseId);
                    setResumeCandidate(null);
                    setState('creating');
                  }}
                >
                  Resume
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Authentication Warning */}
          {!devAgent && !user && !authLoading && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>Please log in to create courses</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/auth')}
                >
                  Log In
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {authError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{authError}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/auth')}
                >
                  Log In
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <Card className="border-2 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Create New Course
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  placeholder="e.g., Photosynthesis, Fractions, World War II"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  className="mt-1"
                  autoFocus
                  data-cta-id="ai-course-subject"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Grade Level</Label>
                  <select
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="w-full mt-1 h-10 px-3 border rounded-md bg-background"
                  >
                    {GRADE_OPTIONS.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Items</Label>
                  <Input
                    type="number"
                    min={4}
                    max={24}
                    value={itemsPerGroup}
                    onChange={(e) => setItemsPerGroup(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label>Question Type</Label>
                <div className="flex gap-2 mt-1">
                  {MODE_OPTIONS.map(opt => (
                    <Button
                      key={opt.value}
                      type="button"
                      variant={mode === opt.value ? 'default' : 'outline'}
                      className="flex-1"
                      onClick={() => setMode(opt.value)}
                    >
                      {opt.icon} {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Special Requests (optional)</Label>
                <Input
                  id="notes"
                  placeholder="e.g., Focus on word problems, Include diagrams"
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  className="mt-1"
                  data-cta-id="ai-course-notes"
                />
              </div>

              <Button
                onClick={handleCreate}
                disabled={creating || !subject.trim() || (!devAgent && !user && !authLoading)}
                size="lg"
                className="w-full"
                data-cta-id="ai-course-generate"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : !devAgent && !user && !authLoading ? (
                  <>
                    <AlertCircle className="h-4 w-4 mr-2" />
                    Log In Required
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Course
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Recent Courses - Collapsible */}
          {recentJobs.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Recent Courses</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRecent(!showRecent)}
                  >
                    {showRecent ? 'Hide' : 'Show'} ({recentJobs.length})
                  </Button>
                </div>
              </CardHeader>
              {showRecent && (
                <CardContent>
                  <div className="space-y-2">
                    {recentJobs.map(job => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => {
                          setCurrentJobId(job.id);
                          setState('complete');
                        }}
                      >
                        <div>
                          <div className="font-medium">{job.subject}</div>
                          <div className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                          </div>
                        </div>
                        <Badge variant="outline">Completed</Badge>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    className="w-full mt-4"
                    onClick={() => navigate('/admin/jobs')}
                  >
                    View All Jobs
                  </Button>
                </CardContent>
              )}
            </Card>
          )}
        </div>
      )}

      {/* State: Creating - Progress View */}
      {state === 'creating' && job && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    Generating: {job.subject || 'Course'}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Started {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Progress</span>
                  <span className="text-muted-foreground">{progress}%</span>
                </div>
                <Progress value={progress} className="h-3" />
              </div>

              {/* Current Step */}
              <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="font-medium">Current Step</span>
                </div>
                <p className="text-lg">{currentPhase}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Estimated time remaining: {Math.max(1, Math.ceil((100 - progress) / 20))} minutes
                </p>
              </div>

              {/* What's Happening */}
              <div>
                <h3 className="font-medium mb-3">What's happening now:</h3>
                <div className="space-y-2">
                  {events.slice(-5).map((event, idx) => (
                    <div key={event.id || idx} className="flex items-start gap-3 p-2 rounded-lg bg-muted/50">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 text-sm">
                        <p>{event.message || event.step}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {events.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">Initializing...</p>
                  )}
                </div>
              </div>

              {/* Stuck Warning */}
              {showPendingStuckWarning && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    This job has been pending for a while. The job runner may not be active.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* State: Complete - Result View */}
      {state === 'complete' && job && (
        <div className="space-y-6">
          <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                <CardTitle>Course Generated: {job.subject || 'Course'}</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Completed {formatDistanceToNow(new Date(job.updated_at || job.created_at), { addSuffix: true })}
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Preview Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Course Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{job.subject || 'Untitled Course'}</span>
                      <Badge>{job.grade_band || job.grade || 'All Grades'}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {job.items_per_group || 12} practice items
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <div className="space-y-3">
                <h3 className="font-medium">Quick Actions</h3>
                <div className="grid grid-cols-3 gap-3">
                  <Button
                    variant="outline"
                    onClick={handleViewCourse}
                    className="flex flex-col h-auto py-4"
                  >
                    <Edit className="h-5 w-5 mb-2" />
                    <span>Edit</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleViewCourse}
                    className="flex flex-col h-auto py-4"
                  >
                    <Eye className="h-5 w-5 mb-2" />
                    <span>Preview</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleViewCourse}
                    className="flex flex-col h-auto py-4"
                  >
                    <Rocket className="h-5 w-5 mb-2" />
                    <span>Publish</span>
                  </Button>
                </div>
              </div>

              {/* Create Another */}
              <Button
                onClick={handleCreateAnother}
                variant="default"
                className="w-full"
                size="lg"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Create Another Course
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}

