import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface MediaJob {
  id: string;
  course_id: string;
  item_id: number;
  media_type: 'image' | 'audio' | 'video';
  prompt: string;
  provider: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  result_url?: string;
  error?: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
  idempotency_key?: string;
  target_ref?: Record<string, any>;
  style?: string;
  priority?: number;
  attempts?: number;
  last_heartbeat?: string;
  dead_letter_reason?: string;
  asset_version?: number;
  cost_usd?: number;
  created_by?: string;
  started_at?: string;
  completed_at?: string;
}

interface UseMediaJobRealtimeOptions {
  courseId?: string;
  onJobComplete?: (job: MediaJob) => void;
  onJobFailed?: (job: MediaJob) => void;
}

export function useMediaJobRealtime({
  courseId,
  onJobComplete,
  onJobFailed,
}: UseMediaJobRealtimeOptions = {}) {
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const { toast } = useToast();

  // Fetch initial jobs
  const fetchJobs = useCallback(async () => {
    if (!courseId) return;

    const query = supabase
      .from('ai_media_jobs')
      .select('*')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
      .limit(20);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching media jobs:', error);
      return;
    }

    setJobs((data || []) as MediaJob[]);
  }, [courseId]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!courseId) return;

    // Initial fetch
    fetchJobs();

    // Subscribe to changes
    const channel = supabase
      .channel(`media-jobs-${courseId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_media_jobs',
          filter: `course_id=eq.${courseId}`,
        },
        (payload) => {
          console.log('Media job change:', payload);

          const job = payload.new as MediaJob;

          // Update jobs list
          setJobs((prev) => {
            const existing = prev.find((j) => j.id === job.id);
            if (existing) {
              // Update existing job
              return prev.map((j) => (j.id === job.id ? job : j));
            } else {
              // Add new job
              return [job, ...prev];
            }
          });

          // Handle status changes
          if (payload.eventType === 'UPDATE') {
            const oldJob = payload.old as MediaJob;

            // Job completed
            if (oldJob.status !== 'done' && job.status === 'done') {
              toast({
                title: 'Media Generated',
                description: `${job.media_type} for item ${job.item_id} is ready`,
              });
              onJobComplete?.(job);
            }

            // Job failed
            if (oldJob.status !== 'failed' && job.status === 'failed') {
              toast({
                title: 'Generation Failed',
                description: job.error || 'An error occurred during media generation',
                variant: 'destructive',
              });
              onJobFailed?.(job);
            }
          }

          // New job created
          if (payload.eventType === 'INSERT') {
            toast({
              title: 'Media Generation Started',
              description: `Generating ${job.media_type} with ${job.provider}...`,
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsSubscribed(true);
          console.log('Subscribed to media jobs channel');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Media jobs channel error');
          setIsSubscribed(false);
        }
      });

    return () => {
      channel.unsubscribe();
      setIsSubscribed(false);
    };
  }, [courseId, supabase, fetchJobs, toast, onJobComplete, onJobFailed]);

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

