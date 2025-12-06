import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { JobStatus } from "@/hooks/useJobStatus";

// Props can be driven either by a JobStatus object or explicit values (for reuse)
interface CourseGenerationProgressProps {
  jobStatus?: JobStatus | null;
  stage?: string;
  percent?: number;
  message?: string;
  status?: string;
}

const stepLabels: Record<string, string> = {
  queued: "Queued",
  generating: "Generating course content",
  storage_write: "Saving course to storage",
  catalog_update: "Updating catalog",
  verifying: "Verifying course and catalog",
  done: "Complete",
  failed: "Failed",
};

const stepIcons: Record<string, React.ReactNode> = {
  queued: <Clock className="h-4 w-4" />,
  generating: <Loader2 className="h-4 w-4 animate-spin" />,
  storage_write: <Loader2 className="h-4 w-4 animate-spin" />,
  catalog_update: <Loader2 className="h-4 w-4 animate-spin" />,
  verifying: <Loader2 className="h-4 w-4 animate-spin" />,
  done: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
};

export function CourseGenerationProgress({ jobStatus, stage, percent, message, status }: CourseGenerationProgressProps) {
  const step = (jobStatus?.step || stage || 'queued') as string;
  const progress = typeof jobStatus?.progress === 'number' ? jobStatus!.progress : (percent ?? 0);
  const state = (jobStatus?.state || status || 'processing') as string;
  const label = message || jobStatus?.message || stepLabels[step] || 'Processing...';

  const isActive = ['processing', 'pending', 'running', 'info'].includes(state);
  const isCompleted = state === 'done';
  const isFailed = state === 'failed';

  return (
    <Card className="p-6 border-2 border-primary">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {stepIcons[step] || stepIcons.queued}
            <span className="font-medium">{stepLabels[step] || step}</span>
          </div>
          <Badge variant={isCompleted ? "default" : isFailed ? "destructive" : "secondary"}>
            {state}
          </Badge>
        </div>

        {isActive && (
          <>
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground">{label}</p>
          </>
        )}

        {isCompleted && (
          <div className="text-sm text-green-600 dark:text-green-400">
            {label || "Course generated successfully!"}
          </div>
        )}

        {isFailed && (
          <div className="text-sm text-red-600 dark:text-red-400">
            {label || "Course generation failed"}
          </div>
        )}
      </div>
    </Card>
  );
}
