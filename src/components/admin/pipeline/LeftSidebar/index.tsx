import { useState } from 'react';
import { QuickStartPanel } from './QuickStartPanel';
import { ActiveJobsList } from './ActiveJobsList';
import { RecentJobsList } from './RecentJobsList';
import { QueueStatusSummary } from './QueueStatusSummary';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
// cn import removed - not used
import { useMCP } from '@/hooks/useMCP';
import { toast } from 'sonner';

interface LeftSidebarProps {
  selectedJobId: string | null;
  onJobSelect: (jobId: string) => void;
}

export function LeftSidebar({ selectedJobId, onJobSelect }: LeftSidebarProps) {
  const [sectionsExpanded, setSectionsExpanded] = useState({
    create: true,
    queue: true,
    active: true,
    recent: false, // Collapsed by default
  });
  const { call } = useMCP();

  const handleProcessQueue = async () => {
    try {
      // Trigger job runner to process queued jobs
      const result = await call('lms.processQueue', {}) as { ok?: boolean; error?: string };
      if (result?.ok) {
        toast.success('Queue processing started');
      } else {
        throw new Error(result?.error || 'Failed to process queue');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to process queue');
    }
  };

  const toggleSection = (section: keyof typeof sectionsExpanded) => {
    setSectionsExpanded(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <aside className="w-80 border-r bg-background overflow-y-auto flex flex-col">
      {/* Quick Start - Always visible */}
      <div className="p-4 border-b">
        <QuickStartPanel onJobCreated={onJobSelect} />
      </div>

      {/* Queue Status Summary */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Queue Overview</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => toggleSection('queue')}
          >
            {sectionsExpanded.queue ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
        {sectionsExpanded.queue && (
          <QueueStatusSummary onProcessQueue={handleProcessQueue} />
        )}
      </div>

      {/* Active Jobs */}
      <div className="p-4 border-b flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Active Jobs</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => toggleSection('active')}
          >
            {sectionsExpanded.active ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
        {sectionsExpanded.active && (
          <ActiveJobsList selectedJobId={selectedJobId} onJobSelect={onJobSelect} />
        )}
      </div>

      {/* Recent Jobs - Collapsible */}
      <div className="p-4 border-t">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Recent Jobs</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => toggleSection('recent')}
          >
            {sectionsExpanded.recent ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
        {sectionsExpanded.recent && (
          <RecentJobsList selectedJobId={selectedJobId} onJobSelect={onJobSelect} />
        )}
      </div>
    </aside>
  );
}
