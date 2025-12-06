/**
 * useMediaJobRealtime - IgniteZero compliant
 * Uses edge functions instead of direct Supabase calls
 * Polls for updates instead of realtime subscriptions
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { listMediaJobs, MediaJob } from '@/lib/api/jobs';
import { useToast } from '@/hooks/use-toast';

interface UseMediaJobRealtimeOptions {
  courseId?: string;
  pollInterval?: number;
  onJobComplete?: (job: MediaJob) => void;
  onJobFailed?: (job: MediaJob) => void;
}

export function useMediaJobRealtime({
  courseId,
  pollInterval = 3000,
  onJobComplete,
  onJobFailed,
}: UseMediaJobRealtimeOptions = {}) {
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const { toast } = useToast();
  const previousJobsRef = useRef<Map<string, MediaJob>>(new Map());

  // Fetch jobs via edge function
  const fetchJobs = useCallback(async () => {
    if (!courseId) return;

    try {
      const response = await listMediaJobs({
        courseId,
        limit: 20,
      });

      if (response.ok) {
        const newJobs = response.jobs;
        
        // Check for status changes
        newJobs.forEach((job) => {
          const prevJob = previousJobsRef.current.get(job.id);
          
          if (prevJob) {
            // Job completed
            if (prevJob.status !== 'done' && job.status === 'done') {
              toast({
                title: 'Media Generated',
                description: `${job.media_type} for item ${job.item_id} is ready`,
              });
              onJobComplete?.(job);
            }

            // Job failed
            if (prevJob.status !== 'failed' && job.status === 'failed') {
              toast({
                title: 'Generation Failed',
                description: job.error || 'An error occurred during media generation',
                variant: 'destructive',
              });
              onJobFailed?.(job);
            }
          } else if (!previousJobsRef.current.has(job.id) && previousJobsRef.current.size > 0) {
            // New job created (only show if we've loaded before)
            toast({
              title: 'Media Generation Started',
              description: `Generating ${job.media_type} with ${job.provider}...`,
            });
          }
        });

        // Update previous jobs reference
        previousJobsRef.current = new Map(newJobs.map((j) => [j.id, j]));
        setJobs(newJobs);
      }
    } catch (error) {
      console.error('Error fetching media jobs:', error);
    }
  }, [courseId, toast, onJobComplete, onJobFailed]);

  // Poll for updates
  useEffect(() => {
    if (!courseId) return;

    // Initial fetch
    fetchJobs();
    setIsSubscribed(true);

    // Poll for changes
    const interval = setInterval(fetchJobs, pollInterval);

    return () => {
      clearInterval(interval);
      setIsSubscribed(false);
    };
  }, [courseId, fetchJobs, pollInterval]);

  const refreshJobs = useCallback(() => {
    fetchJobs();
  }, [fetchJobs]);

  const getPendingJobs = useCallback(() => {
    return jobs.filter((j) => j.status === 'pending' || j.status === 'processing');
  }, [jobs]);

  const getCompletedJobs = useCallback(() => {
    return jobs.filter((j) => j.status === 'done');
  }, [jobs]);

  const getFailedJobs = useCallback(() => {
    return jobs.filter((j) => j.status === 'failed');
  }, [jobs]);

  return {
    jobs,
    isSubscribed,
    refreshJobs,
    getPendingJobs,
    getCompletedJobs,
    getFailedJobs,
  };
}
