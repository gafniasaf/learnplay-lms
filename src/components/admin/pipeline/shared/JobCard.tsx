import { Card } from '@/components/ui/card';
// Badge import removed - not used
import { Progress } from '@/components/ui/progress';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Job } from '@/hooks/useJobsList';

interface JobCardProps {
  job: Job;
  isActive?: boolean;
  onClick?: () => void;
}

export function JobCard({ job, isActive, onClick }: JobCardProps) {
  const statusColor = {
    pending: 'bg-yellow-500',
    running: 'bg-green-500 animate-pulse',
    done: 'bg-green-500',
    failed: 'bg-red-500'
  }[job.status] || 'bg-gray-500';

  const statusBadge = {
    pending: 'Queued',
    running: 'Processing',
    done: 'Complete',
    failed: 'Failed'
  }[job.status] || job.status;

  // Calculate progress from status
  const progress = job.status === 'done' ? 100 : job.status === 'running' ? 60 : 0;

  return (
    <Card
      data-testid="job-card"
      data-job-id={job.id}
      className={cn(
        'p-3 cursor-pointer transition-all hover:border-primary hover:shadow-sm',
        isActive && 'border-primary bg-primary/5'
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('w-2 h-2 rounded-full', statusColor)} />
        <span className="font-semibold text-sm flex-1">{job.subject}</span>
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        {statusBadge} · {job.grade_band || job.grade || 'All Grades'}
      </div>

      {job.status === 'running' && (
        <Progress value={progress} className="h-1 mb-2" />
      )}

      <div className="text-xs text-muted-foreground">
        {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
      </div>
    </Card>
  );
}
