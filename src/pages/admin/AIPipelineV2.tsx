/**
 * AI Pipeline V2 - Complete Redesign
 * 
 * Focus: Single job at a time, clear workflow
 * States: idle (create) | creating (progress) | complete (result)
 */

import { useState, useEffect } from 'react';
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

export default function AIPipelineV2() {
  const [state, setState] = useState<GeneratorState>('idle');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('3-5');
  const [itemsPerGroup, setItemsPerGroup] = useState(12);
  const [mode, setMode] = useState<'options' | 'numeric'>('options');
  const [specialRequests, setSpecialRequests] = useState('');
  const [creating, setCreating] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  
  const { enqueueJob } = useMCP();
  const { job, events, loading: jobLoading } = useJobContext(currentJobId);
  const { jobs: recentJobs } = useJobsList({ limit: 5, status: 'done' });
  const navigate = useNavigate();

  // Auto-detect state from job status
  useEffect(() => {
    if (!currentJobId) {
      setState('idle');
      return;
    }

    if (job) {
      if (job.status === 'done') {
        setState('complete');
      } else if (['pending', 'processing', 'running'].includes(job.status)) {
        setState('creating');
      } else if (job.status === 'failed') {
        setState('idle'); // Reset on failure
        toast.error('Course generation failed. Please try again.');
        setCurrentJobId(null);
      }
    }
  }, [job, currentJobId]);

  const handleCreate = async () => {
    if (!subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }

    setCreating(true);
    try {
      const courseId = `${subject.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
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
        setState('creating');
        setSubject('');
        setSpecialRequests('');
        toast.success('Course generation started!');
      } else {
        throw new Error(result.error || 'Failed to create job');
      }
    } catch (err) {
      console.error('[AIPipelineV2] Creation failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create course');
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async () => {
    if (!currentJobId || !job) return;
    if (confirm('Cancel course generation? This cannot be undone.')) {
      setCurrentJobId(null);
      setState('idle');
      toast.info('Generation cancelled');
    }
  };

  const handleViewCourse = () => {
    if (!job) return;
    const courseId = (job as any)?.course_id || 
                     (job as any)?.payload?.course_id ||
                     (job as any)?.result?.course_id;
    if (courseId) {
      navigate(`/admin/courses/${courseId}`);
    }
  };

  const handleCreateAnother = () => {
    setCurrentJobId(null);
    setState('idle');
  };

  // Calculate progress
  const progress = (() => {
    if (!job || !events) return 0;
    const phases = ['generating', 'validating', 'repairing', 'reviewing', 'images', 'enriching'];
    const completed = phases.filter(p => events.some(e => e.step === p)).length;
    return Math.round((completed / phases.length) * 100);
  })();

  const currentPhase = (() => {
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
                />
              </div>

              <Button
                onClick={handleCreate}
                disabled={creating || !subject.trim()}
                size="lg"
                className="w-full"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
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
              {job.status === 'pending' && events.length === 0 && (
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
                <CardTitle>Course Generated: {job.subject}</CardTitle>
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
                      <span className="font-medium">{job.subject}</span>
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

