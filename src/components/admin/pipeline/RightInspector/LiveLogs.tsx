import { useEffect, useState, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useJobContext } from '@/hooks/useJobContext';
import { formatLogEntry } from '@/lib/pipeline/logFormatter';
import { cn } from '@/lib/utils';

interface LiveLogsProps {
  jobId: string | null;
  filterStep?: string | null;
}

const STEP_EVENTS = new Set(['generating', 'validating', 'repairing', 'reviewing', 'images', 'enriching']);

export function LiveLogs({ jobId, filterStep }: LiveLogsProps) {
  const { events } = useJobContext(jobId);
  const [autoScroll, setAutoScroll] = useState(true);
  const [verbose, setVerbose] = useState(false);
  const [page, setPage] = useState(0);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const PAGE_SIZE = 200;

  const filteredEvents = useMemo(() => {
    let filtered = events;
    // Filter by step if provided
    if (filterStep) {
      filtered = filtered.filter(e => e.step === filterStep);
    }
    // If not verbose, show only step-level events
    if (!verbose) {
      filtered = filtered.filter(e => STEP_EVENTS.has(e.step) || e.status === 'failed' || e.status === 'done');
    }
    return filtered;
  }, [events, filterStep, verbose]);

  const paginatedEvents = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filteredEvents.slice(start, start + PAGE_SIZE);
  }, [filteredEvents, page]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [paginatedEvents, autoScroll]);

  if (!jobId) {
    return null;
  }

  const logs = paginatedEvents.map(formatLogEntry);
  const totalPages = Math.ceil(filteredEvents.length / PAGE_SIZE);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xs uppercase text-muted-foreground">Live Logs</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setVerbose(!verbose)}
            >
              {verbose ? 'Verbose' : 'Concise'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setAutoScroll(!autoScroll)}
            >
              {autoScroll ? '● Auto' : 'Manual'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs max-h-80 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-gray-500 text-center py-4">No logs yet</div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-gray-500 shrink-0">{log.timestamp}</span>
                  <span className={cn(log.color)}>{log.icon}</span>
                  <span className="text-gray-300 flex-1">{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>Page {page + 1} of {totalPages} ({filteredEvents.length} events)</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
                Prev
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
