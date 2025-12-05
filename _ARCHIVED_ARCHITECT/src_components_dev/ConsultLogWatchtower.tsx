import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { ensureSessionSlug } from '@/lib/session';

interface PlanRow {
  id: string;
  created_at: string;
  project_name?: string;
  summary?: string;
  plan?: Record<string, unknown>;
  markdown_plan?: string;
}

interface ConsultRow {
  id: string;
  created_at: string;
  mode: string;
  response: string;
  metadata?: Record<string, unknown>;
}

export function ConsultLogWatchtower() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [consults, setConsults] = useState<ConsultRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [expandedConsult, setExpandedConsult] = useState<string | null>(null);
  const { user } = useAuth();
  const sessionSlug = useMemo(() => ensureSessionSlug(), []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('resume-session', {
        body: { limit: 10, ownerId: user?.id, sessionId: sessionSlug },
      });
      if (error) {
        throw error;
      }
      setPlans(data?.plans ?? []);
      setConsults(data?.consults ?? []);
      if ((data?.plans ?? []).length === 0 && (data?.consults ?? []).length === 0) {
        toast('No sessions logged yet.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load session history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatTimestamp = (value?: string) =>
    value ? new Date(value).toLocaleString() : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <p className="text-xs uppercase tracking-wider text-slate-400">
            Session History
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-emerald-400"
          onClick={loadData}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              Refreshing...
            </>
          ) : (
            <>
              <RefreshCcw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </>
          )}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-slate-950 border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Badge className="bg-emerald-500/20 text-emerald-300 border-0">Plans</Badge>
              Architect Snapshots
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {plans.length === 0 && (
              <p className="text-xs text-slate-500">No plans stored yet.</p>
            )}
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="border border-slate-800 rounded-lg p-3 bg-slate-900/40"
              >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{plan.project_name || 'Untitled Project'}</span>
                  <span>{formatTimestamp(plan.created_at)}</span>
                </div>
                {plan.summary && (
                  <p className="text-sm text-slate-200 mt-2">{plan.summary}</p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-emerald-400 hover:text-emerald-300 px-0 mt-2"
                  onClick={() =>
                    setExpandedPlan(expandedPlan === plan.id ? null : plan.id)
                  }
                >
                  {expandedPlan === plan.id ? 'Hide Details' : 'View JSON'}
                </Button>
                {expandedPlan === plan.id && (
                  <pre className="mt-2 max-h-48 overflow-auto text-xs bg-slate-950 border border-slate-800 rounded-md p-3 text-slate-200">
                    {JSON.stringify(plan.plan ?? {}, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-slate-950 border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Badge className="bg-cyan-500/20 text-cyan-300 border-0">Consults</Badge>
              Architect Conversations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {consults.length === 0 && (
              <p className="text-xs text-slate-500">No consult history yet.</p>
            )}
            {consults.map((log) => (
              <div
                key={log.id}
                className="border border-slate-800 rounded-lg p-3 bg-slate-900/40"
              >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="capitalize">{log.mode}</span>
                  <span>{formatTimestamp(log.created_at)}</span>
                </div>
                <p className="text-sm text-slate-200 mt-2 line-clamp-3">
                  {log.response}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-cyan-300 hover:text-cyan-200 px-0 mt-2"
                  onClick={() =>
                    setExpandedConsult(
                      expandedConsult === log.id ? null : log.id,
                    )
                  }
                >
                  {expandedConsult === log.id ? 'Hide Response' : 'Expand Response'}
                </Button>
                {expandedConsult === log.id && (
                  <pre className="mt-2 max-h-48 overflow-auto text-xs bg-slate-950 border border-slate-800 rounded-md p-3 text-slate-200 whitespace-pre-wrap">
                    {log.response}
                  </pre>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

