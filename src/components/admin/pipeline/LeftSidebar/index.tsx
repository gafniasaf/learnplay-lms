import { QuickStartPanel } from './QuickStartPanel';
import { ActiveJobsList } from './ActiveJobsList';
import { RecentJobsList } from './RecentJobsList';

interface LeftSidebarProps {
  selectedJobId: string | null;
  onJobSelect: (jobId: string) => void;
}

export function LeftSidebar({ selectedJobId, onJobSelect }: LeftSidebarProps) {
  return (
    <aside className="w-80 border-r bg-background overflow-y-auto p-4 space-y-4">
      <QuickStartPanel onJobCreated={onJobSelect} />
      <ActiveJobsList selectedJobId={selectedJobId} onJobSelect={onJobSelect} />
      <RecentJobsList selectedJobId={selectedJobId} onJobSelect={onJobSelect} />
    </aside>
  );
}
