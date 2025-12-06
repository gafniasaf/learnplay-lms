import { useEffect } from 'react';
import { LeftSidebar } from './LeftSidebar';
import { MainCanvas } from './MainCanvas';
import { RightInspector } from './RightInspector';
import { useSearchParams } from 'react-router-dom';

export function PipelineLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const jobId = searchParams.get('jobId');

  // Persist selection for deterministic E2E and UX continuity
  useEffect(() => {
    try {
      if (jobId) {
        window.localStorage.setItem('selectedJobId', jobId);
      }
    } catch {}
  }, [jobId]);

  const handleJobSelect = (newJobId: string) => {
    setSearchParams({ jobId: newJobId }, { replace: true });
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <LeftSidebar
        selectedJobId={jobId}
        onJobSelect={handleJobSelect}
      />
      <MainCanvas jobId={jobId} />
      <RightInspector jobId={jobId} />
    </div>
  );
}
