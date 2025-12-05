import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';

type JobRecord = {
  id: string;
  job_type: string;
  status: string;
  created_at: string;
  updated_at?: string;
  payload?: Record<string, unknown>;
  result_json?: Record<string, unknown>;
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500',
  processing: 'bg-blue-500',
  done: 'bg-emerald-500',
  failed: 'bg-red-500',
};

export function JobWatchtower() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);

  useEffect(() => {
    const fetchJobs = async () => {
      const { data } = await supabase
        .from('ai_agent_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setJobs(data);
    };
    fetchJobs();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('jobs-monitor')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ai_agent_jobs' },
        (payload) => {
          const incoming = payload.new as JobRecord | null;
          if (incoming) {
            setJobs((prev) => {
              const updated = [incoming, ...prev.filter(j => j.id !== incoming.id)];
              return updated.slice(0, 50);
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-800 bg-slate-900/60 shadow-lg">
        <div className="border-b border-slate-800 px-4 py-3">
          <h2 className="text-lg font-semibold text-white">AI Job Watchtower</h2>
          <p className="text-xs text-slate-400">Live feed of ai_agent_jobs</p>
        </div>
        <ScrollArea className="max-h-[540px]">
          <table className="w-full text-sm text-slate-300">
            <thead className="bg-slate-900 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Job Type</th>
                <th className="px-4 py-2 text-left">Created</th>
                <th className="px-4 py-2 text-left">Updated</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr
                  key={job.id}
                  className="cursor-pointer border-t border-slate-800/80 hover:bg-slate-900"
                  onClick={() => setSelectedJob(job)}
                >
                  <td className="px-4 py-2">
                    <Badge className={`${STATUS_COLORS[job.status] ?? 'bg-slate-600'} text-white`}>
                      {job.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{job.job_type}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">
                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {job.updated_at ? formatDistanceToNow(new Date(job.updated_at), { addSuffix: true }) : '—'}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    No jobs yet. Waiting for activity...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      </div>

      <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
        <DialogContent className="max-w-3xl bg-slate-950 text-slate-50">
          <DialogHeader>
            <DialogTitle className="text-neon-green">Job Detail</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[420px] rounded bg-slate-900 p-4 font-mono text-xs text-slate-100">
            <pre>{JSON.stringify(selectedJob, null, 2)}</pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}


