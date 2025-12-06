import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePipelineJob } from '@/hooks/usePipelineJob';

interface PhaseTimelineProps {
  jobId: string | null;
}

const PHASES = [
  { id: 0, label: 'Generate' },
  { id: 1, label: 'Validate' },
  { id: 2, label: 'Repair' },
  { id: 3, label: 'Review' },
  { id: 4, label: 'Images' },
  { id: 5, label: 'Enrich' }
];

export function PhaseTimeline({ jobId }: PhaseTimelineProps) {
  const { events, job } = usePipelineJob(jobId);

  const phaseStatuses = useMemo(() => {
    const observed = new Set((events || []).map(e => e.step));
    return PHASES.map(p => {
      const stepName = (
        p.id === 0 ? 'generating' :
        p.id === 1 ? 'validating' :
        p.id === 2 ? 'repairing' :
        p.id === 3 ? 'reviewing' :
        p.id === 4 ? 'images' :
        'enriching'
      );

      if (observed.has(stepName)) {
        return { ...p, status: 'complete' as const };
      }
      // If job failed and last event step equals this, mark failed
      const last = events && events.length ? events[events.length - 1].step : '';
      if (job?.status === 'failed' && last === stepName) {
        return { ...p, status: 'failed' as const };
      }
      // Pending by default (we do not infer completion from job status)
      return { ...p, status: 'pending' as const };
    });
  }, [events, job?.status]);

  if (!jobId) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs uppercase text-muted-foreground">Phase Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative pl-8 space-y-4">
          <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200" />

          {phaseStatuses.map((phase) => (
            <div key={phase.id} className="relative">
              <div
                className={cn(
                  'absolute -left-8 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-semibold',
                  phase.status === 'complete' && 'border-green-500 bg-green-500 text-white',
                  phase.status === 'failed' && 'border-red-500 bg-red-500 text-white',
                  phase.status === 'pending' && 'border-gray-300 bg-white text-gray-400'
                )}
              >
                {phase.status === 'complete' ? (
                  <Check className="w-4 h-4" />
                ) : phase.status === 'failed' ? (
                  <X className="w-4 h-4" />
                ) : (
                  phase.id
                )}
              </div>

              <div>
                <div className="text-sm font-medium">{phase.label}</div>
                {phase.status === 'complete' && (
                  <div className="text-xs text-muted-foreground">Complete</div>
                )}
                {phase.status === 'pending' && (
                  <div className="text-xs text-muted-foreground">Waiting...</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
