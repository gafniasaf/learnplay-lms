/**
 * JobTicketEditor - Edit interface for JobTicket entity
 * 
 * Follows IgniteZero Manifest-First pattern:
 * - Uses MCP for all data operations
 * - Field schema derived from system-manifest.json via contracts.ts
 * - Read-only view for job inspection with requeue capability
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMCP } from '@/hooks/useMCP';
import { EntityForm } from './components/EntityForm';
import { toast } from 'sonner';
import { ArrowLeft, Cog, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import type { JobTicket } from '@/lib/contracts';

export default function JobTicketEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getRecord, saveRecord, requeueJob, deleteJob, loading: mcpLoading } = useMCP();
  
  const [ticket, setTicket] = useState<Partial<JobTicket> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requeueing, setRequeueing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isNew = id === 'new';

  useEffect(() => {
    if (isNew) {
      setTicket({ status: 'queued' });
      setLoading(false);
      return;
    }

    const loadTicket = async () => {
      if (!id) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const result = await getRecord('job-ticket', id) as { record?: JobTicket } | undefined;
        if (result?.record) {
          setTicket(result.record);
        } else {
          setError('Job ticket not found');
        }
      } catch (err) {
        console.error('[JobTicketEditor] Failed to load:', err);
        setError(err instanceof Error ? err.message : 'Failed to load ticket');
      } finally {
        setLoading(false);
      }
    };

    loadTicket();
  }, [id, isNew, getRecord]);

  const handleSave = async (values: Record<string, unknown>) => {
    try {
      const result = await saveRecord('job-ticket', {
        id: isNew ? crypto.randomUUID() : id,
        ...values,
      }) as { ok?: boolean; id?: string } | undefined;
      
      if (result?.ok) {
        toast.success(isNew ? 'Job ticket created!' : 'Job ticket saved!');
        if (isNew && result.id) {
          navigate(`/workspace/job-ticket/${result.id}`, { replace: true });
        }
      } else {
        throw new Error('Save failed');
      }
    } catch (err) {
      console.error('[JobTicketEditor] Save failed:', err);
      toast.error('Failed to save job ticket');
      throw err;
    }
  };

  const handleRequeue = async () => {
    if (!id) return;
    
    setRequeueing(true);
    try {
      const result = await requeueJob(id);
      if (result?.ok) {
        toast.success('Job requeued!');
        // Refresh the ticket data
        const refreshed = await getRecord('job-ticket', id) as { record?: JobTicket } | undefined;
        if (refreshed?.record) {
          setTicket(refreshed.record);
        }
      } else {
        throw new Error('Requeue failed');
      }
    } catch (err) {
      console.error('[JobTicketEditor] Requeue failed:', err);
      toast.error('Failed to requeue job');
    } finally {
      setRequeueing(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    
    if (!confirm('Are you sure you want to delete this job?')) return;
    
    setDeleting(true);
    try {
      const result = await deleteJob(id);
      if (result?.ok) {
        toast.success('Job deleted!');
        navigate('/admin/jobs');
      } else {
        throw new Error('Delete failed');
      }
    } catch (err) {
      console.error('[JobTicketEditor] Delete failed:', err);
      toast.error('Failed to delete job');
    } finally {
      setDeleting(false);
    }
  };

  const getStatusBadge = () => {
    switch (ticket?.status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'running':
        return <Badge variant="default" className="bg-blue-500">Running</Badge>;
      case 'queued':
        return <Badge variant="secondary">Queued</Badge>;
      default:
        return <Badge variant="outline">{ticket?.status || 'Unknown'}</Badge>;
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error}</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          
          {!isNew && (
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              {(ticket?.status === 'failed' || ticket?.status === 'completed') && (
                <Button
                  variant="outline"
                  onClick={handleRequeue}
                  disabled={requeueing}
                  data-cta-id="retry-job"
                >
                  {requeueing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Requeue
                </Button>
              )}
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Delete
              </Button>
            </div>
          )}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Cog className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle>
                {isNew ? 'New Job Ticket' : 'Job Ticket Details'}
              </CardTitle>
              {!isNew && id && (
                <p className="text-sm text-muted-foreground font-mono">{id}</p>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <EntityForm
              entityName="JobTicket"
              initialValues={ticket || {}}
              onSave={handleSave}
              loading={mcpLoading}
            />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

