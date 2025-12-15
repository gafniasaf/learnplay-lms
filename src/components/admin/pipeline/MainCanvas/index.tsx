import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OverviewTab } from './OverviewTab';
import { PhasesTab } from './PhasesTab';
import { PromptsTab } from './PromptsTab';
import { OutputTab } from './OutputTab';
import { JobProgressVisualization } from './JobProgressVisualization';
import { JobActions } from './JobActions';
import { useJobContext } from '@/hooks/useJobContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Info } from 'lucide-react';

interface MainCanvasProps {
  jobId: string | null;
}

export function MainCanvas({ jobId }: MainCanvasProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';
  const { job, events } = useJobContext(jobId);

  const showPendingWarning = useMemo(() => {
    if (!job) return false;
    if (job.status !== 'pending') return false;
    if ((events || []).length > 0) return false;
    const createdAtMs = job.created_at ? new Date(job.created_at).getTime() : NaN;
    const ageMs = Date.now() - createdAtMs;
    // Grace period: don't warn until it's actually stuck.
    return Number.isFinite(ageMs) && ageMs > 90_000;
  }, [job, events]);

  const handleTabChange = (value: string) => {
    setSearchParams({ jobId: jobId || '', tab: value }, { replace: true });
  };

  // Show empty state when no job selected
  if (!jobId) {
    return (
      <main className="flex-1 bg-gray-50 dark:bg-gray-900 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto mt-20">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
              <Info className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold mb-2">No Job Selected</h2>
              <p className="text-muted-foreground">
                Select a job from the sidebar to view details, or create a new course to get started.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
      {/* Job Header with Actions */}
      {job && (
        <div className="bg-background border-b p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {job.subject || (job as any).job_type || 'Job'} 
                {job.status && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({job.status})
                  </span>
                )}
              </h2>
              {job.created_at && (
                <p className="text-sm text-muted-foreground mt-1">
                  Created {new Date(job.created_at).toLocaleString()}
                </p>
              )}
            </div>
            <JobActions jobId={jobId} />
          </div>

          {/* Job Warnings */}
          {showPendingWarning && (
            <Alert className="mt-4 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-sm">
                This job has been pending for a while. The job runner may not be active.
              </AlertDescription>
            </Alert>
          )}

          {job.status === 'failed' && (
            <Alert className="mt-4 border-red-200 bg-red-50 dark:bg-red-950/20">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <AlertDescription className="text-sm">
                This job failed. Check the logs for details or retry the job.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Progress Visualization - Always visible when job selected */}
      {jobId && (
        <div className="p-6 border-b bg-background">
          <JobProgressVisualization jobId={jobId} />
        </div>
      )}

      {/* Tabs for detailed views */}
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="phases">Phases</TabsTrigger>
            <TabsTrigger value="prompts">Prompts</TabsTrigger>
            <TabsTrigger value="output">Output</TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="overview">
              <OverviewTab jobId={jobId} />
            </TabsContent>

            <TabsContent value="phases">
              <PhasesTab jobId={jobId} />
            </TabsContent>

            <TabsContent value="prompts">
              <PromptsTab />
            </TabsContent>

            <TabsContent value="output">
              <OutputTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </main>
  );
}
