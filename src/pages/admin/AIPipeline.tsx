/**
 * AIPipeline - IgniteZero compliant
 * Uses edge functions via API layer instead of direct Supabase calls
 */
import { useEffect, useState } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { PipelineLayout } from '@/components/admin/pipeline/PipelineLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listCourseJobs, getJobMetrics } from '@/lib/api/jobs';
import { callEdgeFunction } from '@/lib/api/common';
import { useMCP } from '@/hooks/useMCP';

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
  const { enqueueJob } = useMCP();

  // Enforce jobId routing: if absent, resolve to latest job and redirect
  useEffect(() => {
    const jobId = searchParams.get('jobId');
    if (!jobId && !loading) {
      const resolveJobId = async () => {
        try {
          const response = await listCourseJobs({ limit: 1 });
          if (response.ok && response.jobs.length > 0) {
            setSearchParams({ jobId: response.jobs[0].id }, { replace: true });
          }
        } catch (error) {
          console.warn('[AIPipeline] Failed to resolve latest job:', error);
        }
      };
      resolveJobId();
    }
  }, [searchParams, loading, setSearchParams]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await getJobMetrics(24);
        if (response.ok) {
          const byStatus = response.courseJobs.byStatus || {};
          setCounts({
            pending: byStatus['pending'] || 0,
            processing: byStatus['processing'] || 0,
            done: byStatus['done'] || 0,
            failed: byStatus['failed'] || 0,
          });
        }
      } catch (error) {
        console.warn('[AIPipeline] Failed to load metrics:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleGenerateMarketing = async () => {
    try {
      setMkSubmitting(true);
      
      // Use MCP enqueueJob
      const result = await enqueueJob('marketing', {
        subject: mkSubject,
        target: mkTarget,
        tone: mkTone,
        channel: mkChannel,
      });
      
      if (result.ok) {
        alert(`Marketing job enqueued: ${result.jobId || 'Success'}`);
      } else {
        throw new Error('Failed to enqueue marketing job');
      }
    } catch (error) {
      console.error('[AIPipeline] Marketing enqueue failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to enqueue');
    } finally {
      setMkSubmitting(false);
    }
  };

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
                  data-cta-id={`view-${t.status}-jobs`}
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
                data-cta-id="generate-marketing"
                onClick={handleGenerateMarketing}
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
