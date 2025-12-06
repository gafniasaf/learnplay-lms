import { useMemo } from 'react';
import { usePipelineJob } from '@/hooks/usePipelineJob';
import { PhaseAccordion } from '../shared/PhaseAccordion';
import { parseJobSummary } from '@/lib/pipeline/jobParser';
import { extractPhaseDetails } from '@/lib/pipeline/phaseExtractor';
import { Loader2 } from 'lucide-react';

interface PhasesTabProps {
  jobId: string | null;
}

export function PhasesTab({ jobId }: PhasesTabProps) {
  const { job, events, loading } = usePipelineJob(jobId);

  const phases = useMemo(() => {
    if (!job) return [];

    const summary = parseJobSummary(job.summary);
    const currentStep = job.status === 'running' ? 'generating' : job.status;

    return extractPhaseDetails(job.status, currentStep, summary);
  }, [job, events]);

  if (!jobId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Select a job to view phase details</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Job not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {phases.map(phase => (
        <PhaseAccordion key={phase.id} phase={phase} />
      ))}
    </div>
  );
}
