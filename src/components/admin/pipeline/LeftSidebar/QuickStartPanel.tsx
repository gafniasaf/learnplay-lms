import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Sparkles, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useJobQuota } from '@/hooks/useJobQuota';

const GRADE_OPTIONS = ['K-2', '3-5', '6-8', '9-12', 'College', 'All'];
const MODE_OPTIONS = [
  { value: 'options', label: '📝 MCQ', description: 'Multiple Choice' },
  { value: 'numeric', label: '🔢 Numeric', description: 'Numeric Answer' }
] as const;

interface QuickStartPanelProps {
  onJobCreated?: (jobId: string) => void;
}

export function QuickStartPanel({ onJobCreated }: QuickStartPanelProps) {
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('3-5');
  const [itemsPerGroup, setItemsPerGroup] = useState(12);
  const [mode, setMode] = useState<'options' | 'numeric'>('options');
  const [specialRequests, setSpecialRequests] = useState('');
  const [creating, setCreating] = useState(false);
  const { quota } = useJobQuota();

  const handleCreate = async () => {
    if (!subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }

    setCreating(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        toast.error('You must be logged in');
        return;
      }

      const courseId = `${subject.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

      const payload: any = {};
      if (specialRequests.trim()) {
        payload.notes = specialRequests.trim();
      }

      // Try MCP proxy first — avoids RLS/schema drift; falls back to direct DB insert in dev
      try {
        const { data, error } = await supabase.functions.invoke('mcp-metrics-proxy', {
          body: {
            method: 'lms.enqueueAndTrack',
            params: {
              type: 'course_generation', // normalized job type
              subject: subject.trim(),
              courseId,
              payload: {
                grade,
                itemsPerGroup,
                mode,
                ...payload,
              },
              timeoutSec: 60,
            },
          },
        });
        if (error) throw error;
        const jobId = (data?.data || data)?.jobId as string | undefined;
        if (jobId) {
          toast.success('Course job created! Processing...');
          onJobCreated?.(jobId);
          setSubject('');
          setSpecialRequests('');
          return;
        }
        // If no jobId returned, fall through to DB insert
      } catch (proxyErr) {
        console.warn('[QuickStart] MCP proxy failed, falling back to direct insert:', proxyErr);
      }

      // Fallback: direct insert (dev/local) — may be blocked by RLS in production
      const { data: job, error } = await supabase
        .from('ai_course_jobs')
        .insert({
          course_id: courseId,
          subject: subject.trim(),
          grade,
          grade_band: grade,
          items_per_group: itemsPerGroup,
          mode,
          status: 'pending',
          created_by: user.id,
          payload: Object.keys(payload).length > 0 ? payload : null,
        })
        .select()
        .single();

      if (error) {
        // Check if it's a rate limit error
        if ((error as any)?.message?.includes?.('Rate limit exceeded')) {
          toast.error('Rate limit exceeded', {
            description: (error as any)?.hint || 'Please wait before creating more jobs'
          });
        } else {
          throw error;
        }
        return;
      }

      toast.success('Course job created! Processing...');
      onJobCreated?.(job.id);

      // Reset form
      setSubject('');
      setSpecialRequests('');
    } catch (error) {
      console.error('Failed to create job:', error);
      toast.error('Failed to create course job', {
        description: (error as any)?.message || (error instanceof Error ? error.message : 'Unknown error')
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Quick Start
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quota Display */}
        {quota && (
          <div className="p-3 bg-muted rounded-md space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Hourly Usage</span>
              <span className="font-medium">{quota.jobs_last_hour} / {quota.hourly_limit}</span>
            </div>
            <Progress 
              value={(quota.jobs_last_hour / quota.hourly_limit) * 100} 
              className="h-1.5"
            />
            <div className="flex justify-between items-center pt-1">
              <span className="text-muted-foreground">Daily Usage</span>
              <span className="font-medium">{quota.jobs_last_day} / {quota.daily_limit}</span>
            </div>
            <Progress 
              value={(quota.jobs_last_day / quota.daily_limit) * 100} 
              className="h-1.5"
            />
            {(quota.jobs_last_hour >= quota.hourly_limit || quota.jobs_last_day >= quota.daily_limit) && (
              <div className="flex items-center gap-1 text-destructive pt-1">
                <AlertCircle className="w-3 h-3" />
                <span>Rate limit reached</span>
              </div>
            )}
          </div>
        )}

        {/* Subject */}
        <div>
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            data-testid="course-title"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g., Fractions, Ancient Rome"
            className="mt-1"
          />
        </div>

        {/* Grade Level */}
        <div>
          <Label>Grade Level</Label>
          <div className="grid grid-cols-3 gap-2 mt-1" data-testid="grade-level-selector">
            {GRADE_OPTIONS.map((g) => (
              <Button
                key={g}
                data-testid={`grade-${g}`}
                variant="outline"
                size="sm"
                className={cn(
                  'text-xs',
                  grade === g && 'border-primary bg-primary/10 text-primary'
                )}
                onClick={() => setGrade(g)}
              >
                {g}
              </Button>
            ))}
          </div>
        </div>

        {/* Items per Group */}
        <div>
          <Label htmlFor="items-slider">Items per Group: {itemsPerGroup}</Label>
          <input
            id="items-slider"
            data-testid="levels-count"
            type="range"
            min="8"
            max="20"
            value={itemsPerGroup}
            onChange={(e) => setItemsPerGroup(parseInt(e.target.value))}
            className="w-full mt-1"
          />
        </div>

        {/* Question Mode */}
        <div>
          <Label>Question Mode</Label>
          <div className="grid grid-cols-2 gap-2 mt-1" data-testid="answer-mode-selector">
            {MODE_OPTIONS.map((m) => (
              <Button
                key={m.value}
                data-testid={`mode-${m.value}`}
                variant="outline"
                size="sm"
                className={cn(
                  'flex flex-col h-auto py-2',
                  mode === m.value && 'border-primary bg-primary/10 text-primary'
                )}
                onClick={() => setMode(m.value)}
              >
                <span>{m.label}</span>
                <span className="text-xs opacity-70">{m.description}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Special Requests */}
        <div>
          <Label htmlFor="special-requests">Special Requests (optional)</Label>
          <textarea
            id="special-requests"
            data-testid="special-requests"
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
            placeholder="e.g., Include real-world examples, focus on visual learners..."
            className="w-full mt-1 px-3 py-2 border rounded-md text-sm min-h-[60px] bg-background"
          />
        </div>

        {/* Create Button */}
        <Button
          data-testid="generate-course"
          onClick={handleCreate}
          disabled={creating || !subject.trim()}
          className="w-full"
        >
          {creating ? (
            <>Creating...</>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Create Course
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
