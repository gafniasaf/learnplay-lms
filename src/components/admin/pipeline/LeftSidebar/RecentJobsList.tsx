import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useJobsList } from '@/hooks/useJobsList';
import { JobCard } from '../shared/JobCard';
import { JobCardSkeleton } from '../Skeleton';
import { useState, useCallback } from 'react';
import { usePipelineJob } from '@/hooks/usePipelineJob';

interface RecentJobsListProps {
  selectedJobId: string | null;
  onJobSelect: (jobId: string) => void;
}

export function RecentJobsList({ selectedJobId, onJobSelect }: RecentJobsListProps) {
  const { jobs, loading } = useJobsList({ limit: 10 });
  const [prefetchedJobId, setPrefetchedJobId] = useState<string | null>(null);

  // Prefetch job data on hover
  usePipelineJob(prefetchedJobId, { enabled: !!prefetchedJobId });

  const handleJobHover = useCallback((jobId: string) => {
    if (jobId !== selectedJobId) {
      setPrefetchedJobId(jobId);
    }
  }, [selectedJobId]);

  // Filter completed jobs (done or failed)
  const recentJobs = jobs.filter(job => job.status === 'done' || job.status === 'failed').slice(0, 5);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <JobCardSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (recentJobs.length === 0) {
    return null; // Don't show if no recent jobs
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Recent Jobs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {recentJobs.map(job => (
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
