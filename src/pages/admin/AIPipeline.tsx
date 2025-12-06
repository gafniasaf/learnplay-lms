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
    <PageContainer className="p-0 h-screen flex flex-col">
      {/* Top Bar with Filters and Actions */}
      <div className="bg-background border-b">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">AI Pipeline</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Create courses with AI and monitor generation progress
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/admin/jobs')}
              >
                View All Jobs
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Pipeline Layout */}
      <div className="flex-1 overflow-hidden">
        <PipelineLayout />
      </div>
    </PageContainer>
  );
}
