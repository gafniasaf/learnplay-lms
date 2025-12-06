/**
 * QuickStartPanel - IgniteZero compliant
 * Uses useMCP for job enqueueing instead of direct Supabase calls
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Sparkles, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useJobQuota } from '@/hooks/useJobQuota';
import { useMCP } from '@/hooks/useMCP';

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
  const { enqueueJob } = useMCP();

  const handleCreate = async () => {
    if (!subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }

    setCreating(true);

    try {
      const courseId = `${subject.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

      const payload: Record<string, unknown> = {
        course_id: courseId,
        subject: subject.trim(),
        grade,
        grade_band: grade,
        items_per_group: itemsPerGroup,
        mode,
      };

      if (specialRequests.trim()) {
        payload.notes = specialRequests.trim();
      }

      // Use MCP enqueueJob
      const result = await enqueueJob('ai_course_generate', payload);

      if (result.ok) {
        const jobId = result.jobId as string;
        toast.success('Course job created! Processing...');
        onJobCreated?.(jobId);
        setSubject('');
        setSpecialRequests('');
      } else {
        throw new Error(result.error || 'Failed to create job');
      }
    } catch (err) {
      console.error('[QuickStart] Job creation failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setCreating(false);
    }
  };

  const hourlyUsage = quota ? Math.round((quota.jobs_last_hour / quota.hourly_limit) * 100) : 0;
  const dailyUsage = quota ? Math.round((quota.jobs_last_day / quota.daily_limit) * 100) : 0;
  const canCreate = quota ? quota.jobs_last_hour < quota.hourly_limit && quota.jobs_last_day < quota.daily_limit : true;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Quick Start
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Rate limit indicator */}
        {quota && (
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Hourly ({quota.jobs_last_hour}/{quota.hourly_limit})</span>
              <span className={cn(hourlyUsage > 80 ? 'text-destructive' : 'text-muted-foreground')}>
                {hourlyUsage}%
              </span>
            </div>
            <Progress value={hourlyUsage} className="h-1" />
            
            <div className="flex justify-between items-center mt-1">
              <span className="text-muted-foreground">Daily ({quota.jobs_last_day}/{quota.daily_limit})</span>
              <span className={cn(dailyUsage > 80 ? 'text-destructive' : 'text-muted-foreground')}>
                {dailyUsage}%
              </span>
            </div>
            <Progress value={dailyUsage} className="h-1" />
          </div>
        )}

        {!canCreate && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="h-3 w-3" />
            Rate limit reached
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label htmlFor="subject" className="text-xs">Subject</Label>
            <Input
              id="subject"
              placeholder="e.g., Photosynthesis, Fractions"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={creating}
              className="h-8 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Grade</Label>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                disabled={creating}
                className="w-full h-8 text-sm border rounded px-2 bg-background"
              >
                {GRADE_OPTIONS.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Items</Label>
              <Input
                type="number"
                min={4}
                max={24}
                value={itemsPerGroup}
                onChange={(e) => setItemsPerGroup(Number(e.target.value))}
                disabled={creating}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Mode</Label>
            <div className="flex gap-1">
              {MODE_OPTIONS.map(opt => (
                <Button
                  key={opt.value}
                  variant={mode === opt.value ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 text-xs h-7"
                  onClick={() => setMode(opt.value)}
                  disabled={creating}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="notes" className="text-xs">Special Requests (optional)</Label>
            <Input
              id="notes"
              placeholder="e.g., Focus on word problems"
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              disabled={creating}
              className="h-8 text-sm"
            />
          </div>

          <Button
            onClick={handleCreate}
            disabled={creating || !subject.trim() || !canCreate}
            className="w-full"
            size="sm"
            data-cta-id="quick-start-create"
          >
            {creating ? (
              <>Creating...</>
            ) : (
              <>
                <Sparkles className="h-3 w-3 mr-1" />
                Create Course
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
