import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useJobsList } from '@/hooks/useJobsList';
import { JobCard } from '../shared/JobCard';
import { JobCardSkeleton } from '../Skeleton';
import { useState, useCallback } from 'react';
import { usePipelineJob } from '@/hooks/usePipelineJob';

interface ActiveJobsListProps {
  selectedJobId: string | null;
  onJobSelect: (jobId: string) => void;
}

export function ActiveJobsList({ selectedJobId, onJobSelect }: ActiveJobsListProps) {
  const { jobs, loading } = useJobsList({ limit: 10 });
  const [prefetchedJobId, setPrefetchedJobId] = useState<string | null>(null);

  // Prefetch job data on hover
  usePipelineJob(prefetchedJobId, { enabled: !!prefetchedJobId });

  const handleJobHover = useCallback((jobId: string) => {
    if (jobId !== selectedJobId) {
      setPrefetchedJobId(jobId);
    }
  }, [selectedJobId]);

  // Filter active jobs (pending, processing, or running)
  const activeJobs = jobs.filter(job => ['pending', 'processing', 'running'].includes(job.status));

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Active Jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <JobCardSkeleton />
          <JobCardSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (activeJobs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Active Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No active jobs
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Active Jobs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {activeJobs.map(job => (
          <div key={job.id} onMouseEnter={() => handleJobHover(job.id)}>
            <JobCard
              job={job}
              isActive={job.id === selectedJobId}
              onClick={() => onJobSelect(job.id)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
