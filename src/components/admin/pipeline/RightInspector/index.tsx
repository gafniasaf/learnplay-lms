import { lazy, Suspense, useState, useEffect } from 'react';
import { PhaseTimeline } from './PhaseTimeline';
import { TimelineSkeleton } from '../Skeleton';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useJobContext } from '@/hooks/useJobContext';

const LiveLogs = lazy(() => import('./LiveLogs').then(m => ({ default: m.LiveLogs })));
const SystemHealth = lazy(() => import('./SystemHealth').then(m => ({ default: m.SystemHealth })));

interface RightInspectorProps {
  jobId: string | null;
}

export function RightInspector({ jobId }: RightInspectorProps) {
  const { job } = useJobContext(jobId);
  const [sectionsExpanded, setSectionsExpanded] = useState({
    timeline: true,
    logs: job?.status === 'processing' || job?.status === 'running', // Only show logs if job is running
    health: false, // Collapsed by default
  });

  // Update logs section expansion when job status changes
  useEffect(() => {
    const shouldShowLogs = job?.status === 'processing' || job?.status === 'running';
    if (shouldShowLogs && !sectionsExpanded.logs) {
      setSectionsExpanded(prev => ({ ...prev, logs: true }));
    }
  }, [job?.status, sectionsExpanded.logs]);

  const toggleSection = (section: keyof typeof sectionsExpanded) => {
    setSectionsExpanded(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Show logs section if job is active
  const shouldShowLogs = job?.status === 'processing' || job?.status === 'running';

  return (
    <aside className="w-72 border-l bg-background overflow-y-auto flex flex-col">
      {/* Phase Timeline - Always visible when job selected */}
      {jobId && (
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Phase Timeline</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => toggleSection('timeline')}
            >
              {sectionsExpanded.timeline ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
          {sectionsExpanded.timeline && (
            <PhaseTimeline jobId={jobId} />
          )}
        </div>
      )}

      {/* Live Logs - Only show when job is running */}
      {shouldShowLogs && (
        <div className="p-4 border-b flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Live Logs</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => toggleSection('logs')}
            >
              {sectionsExpanded.logs ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
          {sectionsExpanded.logs && (
            <div className="flex-1 overflow-hidden">
              <Suspense fallback={<TimelineSkeleton />}>
                <LiveLogs jobId={jobId} />
              </Suspense>
            </div>
          )}
        </div>
      )}

      {/* System Health - Collapsible, at bottom */}
      <div className="p-4 border-t mt-auto">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">System Health</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => toggleSection('health')}
          >
            {sectionsExpanded.health ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
        {sectionsExpanded.health && (
          <Suspense fallback={<TimelineSkeleton />}>
            <SystemHealth />
          </Suspense>
        )}
      </div>
    </aside>
  );
}
