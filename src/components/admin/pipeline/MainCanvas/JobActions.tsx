import { Button } from '@/components/ui/button';
import { useJobContext } from '@/hooks/useJobContext';
import { useNavigate } from 'react-router-dom';
import { useMCP } from '@/hooks/useMCP';
import { toast } from 'sonner';
import { 
  RefreshCw, 
  X, 
  ExternalLink, 
  Download,
  Play,
  FileText
} from 'lucide-react';
import { useState } from 'react';

interface JobActionsProps {
  jobId: string | null;
}

export function JobActions({ jobId }: JobActionsProps) {
  const { job } = useJobContext(jobId);
  const navigate = useNavigate();
  const { call } = useMCP();
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (!job || !jobId) {
    return null;
  }

  const handleRetry = async () => {
    if (job.status !== 'failed') return;

    setRetrying(true);
    try {
      // Retry failed job
      const result = await call('lms.retryJob', { jobId }) as { ok?: boolean; error?: string };
      if (result?.ok) {
        toast.success('Job queued for retry');
        // Refresh job data
        window.location.reload();
      } else {
        throw new Error(result?.error || 'Failed to retry job');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to retry job');
    } finally {
      setRetrying(false);
    }
  };

  const handleCancel = async () => {
    if (!['pending', 'processing'].includes(job.status)) return;

    if (!confirm('Are you sure you want to cancel this job?')) return;

    setCancelling(true);
    try {
      const result = await call('lms.cancelJob', { jobId }) as { ok?: boolean; error?: string };
      if (result?.ok) {
        toast.success('Job cancelled');
        window.location.reload();
      } else {
        throw new Error(result?.error || 'Failed to cancel job');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel job');
    } finally {
      setCancelling(false);
    }
  };

  const handleViewCourse = () => {
    const jobAny = job as any;
    const courseId = jobAny?.payload?.course_id || 
                     jobAny?.result?.course_id ||
                     jobAny?.course_id;
    if (courseId) {
      navigate(`/admin/courses/${courseId}`);
    } else {
      toast.error('Course ID not found');
    }
  };

  const handleViewOutput = () => {
    // Navigate to output tab or open course preview
    const jobAny = job as any;
    const courseId = jobAny?.payload?.course_id || 
                     jobAny?.result?.course_id ||
                     jobAny?.course_id;
    if (courseId) {
      navigate(`/admin/pipeline?jobId=${jobId}&tab=output`);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Retry Failed Job */}
      {job.status === 'failed' && (
        <Button
          size="sm"
          variant="default"
          onClick={handleRetry}
          disabled={retrying}
        >
          <RefreshCw className={cn("h-4 w-4 mr-1", retrying && "animate-spin")} />
          Retry Job
        </Button>
      )}

      {/* Cancel Active Job */}
      {['pending', 'processing'].includes(job.status) && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleCancel}
          disabled={cancelling}
        >
          <X className="h-4 w-4 mr-1" />
          Cancel
        </Button>
      )}

      {/* View Course */}
      {job.status === 'done' && (
        <Button
          size="sm"
          variant="default"
          onClick={handleViewCourse}
        >
          <ExternalLink className="h-4 w-4 mr-1" />
          View Course
        </Button>
      )}

      {/* View Output */}
      {job.status === 'done' && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleViewOutput}
        >
          <FileText className="h-4 w-4 mr-1" />
          View Output
        </Button>
      )}

      {/* Download Result */}
      {job.status === 'done' && (job as any).result && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const jobAny = job as any;
            const dataStr = JSON.stringify(jobAny.result, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `job-${jobId}-result.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="h-4 w-4 mr-1" />
          Download
        </Button>
      )}
    </div>
  );
}

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

