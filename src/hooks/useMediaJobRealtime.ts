/**
 * useMediaJobRealtime - IgniteZero compliant
 * Uses edge functions instead of direct Supabase calls
 * Polls for updates instead of realtime subscriptions
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useMCP } from './useMCP';
import { useToast } from '@/hooks/use-toast';

export interface MediaJob {
  id: string;
  course_id: string;
  item_id: number;
  media_type: 'image' | 'audio' | 'video';
  prompt: string;
  provider: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  error?: string;
  created_at: string;
}

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
  const mcp = useMCP();
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const { toast } = useToast();
  const previousJobsRef = useRef<Map<string, MediaJob>>(new Map());

  // Fetch jobs via edge function
  const fetchJobs = useCallback(async () => {
    if (!courseId) return;

    try {
      const response = await mcp.listMediaJobsFiltered({
        courseId,
        limit: 20,
      });

      if ((response as { ok: boolean }).ok) {
        const newJobs = (response as { jobs: MediaJob[] }).jobs;
        
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
  }, [courseId, toast, onJobComplete, onJobFailed, mcp]);

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
