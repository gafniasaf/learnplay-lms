import { useEffect, useState } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { PipelineLayout } from '@/components/admin/pipeline/PipelineLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function AIPipeline() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [counts, setCounts] = useState<{ pending: number; processing: number; done: number; failed: number }>({ pending: 0, processing: 0, done: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [mkTarget, setMkTarget] = useState('teachers');
  const [mkTone, setMkTone] = useState('friendly');
  const [mkChannel, setMkChannel] = useState('email');
  const [mkSubject, setMkSubject] = useState('Course Marketing Assets');
  const [mkSubmitting, setMkSubmitting] = useState(false);
  const navigate = useNavigate();

  // Enforce jobId routing: if absent, resolve to latest job and redirect
  useEffect(() => {
    const jobId = searchParams.get('jobId');
    if (!jobId && !loading) {
      const resolveJobId = async () => {
        try {
          const { data } = await supabase
            .from('ai_course_jobs')
            .select('id')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (data?.id) {
            setSearchParams({ jobId: data.id }, { replace: true });
          }
        } catch {}
      };
      resolveJobId();
    }
  }, [searchParams, loading, setSearchParams]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const statuses = ['pending', 'processing', 'done', 'failed'] as const;
        const results = await Promise.all(statuses.map(s =>
          supabase.from('ai_course_jobs').select('id', { count: 'exact', head: true }).eq('status', s)
        ));
        setCounts({
          pending: results[0].count || 0,
          processing: results[1].count || 0,
          done: results[2].count || 0,
          failed: results[3].count || 0,
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <PageContainer>
      <div className="max-w-7xl mx-auto mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { key: 'pending', label: 'Queued', status: 'pending' },
            { key: 'processing', label: 'Running', status: 'processing' },
            { key: 'done', label: 'Completed', status: 'done' },
            { key: 'failed', label: 'Failed', status: 'failed' },
          ].map((t) => (
            <Card key={t.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t.label}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="text-2xl font-bold">{loading ? '—' : (counts as any)[t.key]}</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/admin/jobs?status=${t.status}`)}
                >
                  View
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Phase 4: Marketing CTA */}
      <div className="max-w-5xl mx-auto mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Marketing Generator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                className="px-2 py-1 border rounded bg-background"
                placeholder="Subject"
                value={mkSubject}
                onChange={(e) => setMkSubject(e.target.value)}
              />
              <select className="px-2 py-1 border rounded bg-background" value={mkTarget} onChange={(e) => setMkTarget(e.target.value)}>
                <option value="teachers">Teachers</option>
                <option value="parents">Parents</option>
                <option value="admins">Admins</option>
                <option value="students">Students</option>
              </select>
              <select className="px-2 py-1 border rounded bg-background" value={mkTone} onChange={(e) => setMkTone(e.target.value)}>
                <option value="friendly">Friendly</option>
                <option value="inspiring">Inspiring</option>
                <option value="formal">Formal</option>
              </select>
              <select className="px-2 py-1 border rounded bg-background" value={mkChannel} onChange={(e) => setMkChannel(e.target.value)}>
                <option value="email">Email</option>
                <option value="social">Social</option>
                <option value="landing">Landing</option>
              </select>
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={mkSubmitting}
                data-testid="btn-generate-marketing"
                onClick={async () => {
                  try {
                    setMkSubmitting(true);
                    try {
                      const { data, error } = await supabase.functions.invoke('mcp-metrics-proxy', {
                        body: { method: 'lms.enqueueAndTrack', params: { type: 'marketing', subject: mkSubject, payload: { target: mkTarget, tone: mkTone, channel: mkChannel }, timeoutSec: 60 } },
                      });
                      if (!error && data?.ok !== false) {
                        const jid = (data?.data || data)?.jobId;
                        alert(`Marketing job enqueued: ${jid || 'N/A'}`);
                      } else {
                        throw new Error(error?.message || 'proxy_failed');
                      }
                    } catch {
                      const res = await fetch('/functions/v1/enqueue-marketing-job', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          subject: mkSubject,
                          payload: { target: mkTarget, tone: mkTone, channel: mkChannel },
                        }),
                      });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json?.error || 'Failed to enqueue');
                      alert(`Marketing job enqueued: ${json.jobId}`);
                    }
                  } catch (e) {
                    console.error('[AIPipeline] Marketing enqueue failed:', e);
                    alert(e instanceof Error ? e.message : 'Failed to enqueue');
                  } finally {
                    setMkSubmitting(false);
                  }
                }}
              >
                {mkSubmitting ? 'Submitting…' : 'Generate Marketing'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <PipelineLayout />
    </PageContainer>
  );
}
