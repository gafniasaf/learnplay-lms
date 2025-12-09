import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useJobContext } from '@/hooks/useJobContext';
// parseJobSummary import removed - not used

interface JobProgressVisualizationProps {
  jobId: string | null;
}

const PHASES = [
  { id: 0, label: 'Generate', step: 'generating', description: 'Creating course content' },
  { id: 1, label: 'Validate', step: 'validating', description: 'Validating structure' },
  { id: 2, label: 'Repair', step: 'repairing', description: 'Fixing issues' },
  { id: 3, label: 'Review', step: 'reviewing', description: 'Quality review' },
  { id: 4, label: 'Images', step: 'images', description: 'Generating images' },
  { id: 5, label: 'Enrich', step: 'enriching', description: 'Enriching content' },
] as const;

export function JobProgressVisualization({ jobId }: JobProgressVisualizationProps) {
  const { job, events, loading } = useJobContext(jobId);

  const progress = useMemo(() => {
    if (!job || !events) return null;

    const observedSteps = new Set(events.map(e => e.step));
    const currentPhase = PHASES.findIndex(p => !observedSteps.has(p.step));
    const completedPhases = PHASES.filter(p => observedSteps.has(p.step)).length;
    const totalPhases = PHASES.length;
    const progressPercent = (completedPhases / totalPhases) * 100;

    return {
      completedPhases,
      totalPhases,
      progressPercent,
      currentPhase: currentPhase >= 0 ? currentPhase : totalPhases,
      phases: PHASES.map((phase, index) => {
        const isComplete = observedSteps.has(phase.step);
        const isActive = index === currentPhase && job.status === 'processing';
        const isFailed = job.status === 'failed' && index === currentPhase;

        return {
          ...phase,
          status: isComplete ? 'complete' : isActive ? 'active' : isFailed ? 'failed' : 'pending',
        };
      }),
    };
  }, [job, events]);

  if (!jobId || loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
            <div className="h-2 bg-muted animate-pulse rounded" />
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!progress) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">No progress data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Overall Progress</span>
            <span className="text-muted-foreground">
              {progress.completedPhases} of {progress.totalPhases} phases
            </span>
          </div>
          <Progress value={progress.progressPercent} className="h-2" />
          <div className="text-xs text-muted-foreground text-center">
            {Math.round(progress.progressPercent)}% complete
          </div>
        </div>

        {/* Phase List */}
        <div className="space-y-3">
          {progress.phases.map((phase, index) => {
            const isComplete = phase.status === 'complete';
            const isActive = phase.status === 'active';
            const isFailed = phase.status === 'failed';

            return (
              <div
                key={phase.id}
                className={cn(
                  "flex items-center gap-4 p-3 rounded-lg border transition-colors",
                  isActive && "bg-primary/5 border-primary/20",
                  isComplete && "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800",
                  isFailed && "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800",
                  phase.status === 'pending' && "bg-muted/30 border-muted"
                )}
              >
                {/* Status Icon */}
                <div className="flex-shrink-0">
                  {isComplete && (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  )}
                  {isActive && (
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  )}
                  {isFailed && (
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  )}
                  {phase.status === 'pending' && (
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                {/* Phase Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{phase.label}</span>
                    {isActive && (
                      <Badge variant="default" className="text-xs">
                        In Progress
                      </Badge>
                    )}
                    {isComplete && (
                      <Badge variant="outline" className="text-xs text-green-600 dark:text-green-400">
                        Complete
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {phase.description}
                  </p>
                </div>

                {/* Phase Number */}
                <div className={cn(
                  "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold",
                  isComplete && "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300",
                  isActive && "bg-primary text-primary-foreground",
                  isFailed && "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300",
                  phase.status === 'pending' && "bg-muted text-muted-foreground"
                )}>
                  {index + 1}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

