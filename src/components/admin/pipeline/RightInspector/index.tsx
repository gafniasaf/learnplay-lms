import { lazy, Suspense } from 'react';
import { PhaseTimeline } from './PhaseTimeline';
import { TimelineSkeleton } from '../Skeleton';

const LiveLogs = lazy(() => import('./LiveLogs').then(m => ({ default: m.LiveLogs })));
const SystemHealth = lazy(() => import('./SystemHealth').then(m => ({ default: m.SystemHealth })));

interface RightInspectorProps {
  jobId: string | null;
}

export function RightInspector({ jobId }: RightInspectorProps) {
  return (
    <aside className="w-72 border-l bg-background overflow-y-auto p-4 space-y-4">
      <PhaseTimeline jobId={jobId} />
      <Suspense fallback={<TimelineSkeleton />}>
        <LiveLogs jobId={jobId} />
      </Suspense>
      <Suspense fallback={<TimelineSkeleton />}>
        <SystemHealth />
      </Suspense>
    </aside>
  );
}
