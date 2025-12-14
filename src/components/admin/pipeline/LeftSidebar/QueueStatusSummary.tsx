import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useJobsList } from '@/hooks/useJobsList';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock, XCircle, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QueueStatusSummaryProps {
  onProcessQueue?: () => void;
}

export function QueueStatusSummary({ onProcessQueue }: QueueStatusSummaryProps) {
  const { jobs, loading } = useJobsList({ limit: 100 });
  const navigate = useNavigate();

  // Calculate counts
  const counts = {
    queued: jobs.filter(j => j.status === 'pending').length,
    running: jobs.filter(j => j.status === 'processing' || j.status === 'running').length,
    completed: jobs.filter(j => j.status === 'done').length,
    failed: jobs.filter(j => j.status === 'failed').length,
  };

  const total = counts.queued + counts.running + counts.completed + counts.failed;
  const hasStuckJobs = counts.queued > 10;
  const hasFailedJobs = counts.failed > 0;

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Queue Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-4 bg-muted animate-pulse rounded" />
            <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Queue Status</CardTitle>
          {total > 0 && (
            <Badge variant="outline" className="text-xs">
              {total}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Status Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">Queued</div>
              <div className="text-lg font-semibold">{counts.queued}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-md bg-blue-50 dark:bg-blue-950/20">
            <Play className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">Running</div>
              <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                {counts.running}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-md bg-green-50 dark:bg-green-950/20">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">Done</div>
              <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                {counts.completed}
              </div>
            </div>
          </div>

          <div className={cn(
            "flex items-center gap-2 p-2 rounded-md",
            counts.failed > 0 
              ? "bg-red-50 dark:bg-red-950/20" 
              : "bg-muted/50"
          )}>
            <XCircle className={cn(
              "h-4 w-4",
              counts.failed > 0 
                ? "text-red-600 dark:text-red-400" 
                : "text-muted-foreground"
            )} />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">Failed</div>
              <div className={cn(
                "text-lg font-semibold",
                counts.failed > 0 
                  ? "text-red-600 dark:text-red-400" 
                  : ""
              )}>
                {counts.failed}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        {hasStuckJobs && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-3 w-3" />
              <span>{counts.queued} jobs queued</span>
            </div>
            {onProcessQueue && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                onClick={onProcessQueue}
              >
                <Play className="h-3 w-3 mr-1" />
                Process Queue
              </Button>
            )}
          </div>
        )}

        {hasFailedJobs && (
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs"
            onClick={() => navigate('/admin/jobs?status=failed')}
          >
            View Failed ({counts.failed})
          </Button>
        )}

        {total === 0 && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No jobs yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}


