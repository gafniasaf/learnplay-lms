/**
 * AssignmentEditor - Edit interface for Assignment entity
 * 
 * Follows IgniteZero Manifest-First pattern:
 * - Uses MCP for all data operations
 * - Field schema derived from system-manifest.json via contracts.ts
 * - Supports AI-assisted draft planning via enqueueJob
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMCP } from '@/hooks/useMCP';
import { EntityForm } from './components/EntityForm';
import { toast } from 'sonner';
import { ArrowLeft, ClipboardList, Loader2, Sparkles } from 'lucide-react';
import type { Assignment } from '@/lib/contracts';

export default function AssignmentEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getRecord, saveRecord, enqueueJob, loading: mcpLoading } = useMCP();
  
  const [assignment, setAssignment] = useState<Partial<Assignment> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiRunning, setAiRunning] = useState(false);

  const isNew = id === 'new';

  useEffect(() => {
    if (isNew) {
      setAssignment({ status: 'draft' });
      setLoading(false);
      return;
    }

    const loadAssignment = async () => {
      if (!id) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const result = await getRecord('assignment', id) as { record?: Assignment } | undefined;
        if (result?.record) {
          setAssignment(result.record);
        } else {
          setError('Assignment not found');
        }
      } catch (err) {
        console.error('[AssignmentEditor] Failed to load:', err);
        setError(err instanceof Error ? err.message : 'Failed to load assignment');
      } finally {
        setLoading(false);
      }
    };

    loadAssignment();
  }, [id, isNew, getRecord]);

  const handleSave = async (values: Record<string, unknown>) => {
    try {
      const result = await saveRecord('assignment', {
        id: isNew ? crypto.randomUUID() : id,
        ...values,
      }) as { ok?: boolean; id?: string } | undefined;
      
      if (result?.ok) {
        toast.success(isNew ? 'Assignment created!' : 'Assignment saved!');
        if (isNew && result.id) {
          navigate(`/workspace/assignment/${result.id}`, { replace: true });
        }
      } else {
        throw new Error('Save failed');
      }
    } catch (err) {
      console.error('[AssignmentEditor] Save failed:', err);
      toast.error('Failed to save assignment');
      throw err;
    }
  };

  const handleDraftPlan = async () => {
    if (!assignment) return;
    
    setAiRunning(true);
    try {
      const result = await enqueueJob('draft_assignment_plan', {
        title: assignment.title,
        subject: assignment.subject,
        learner_id: assignment.learner_id,
      });
      
      if (result?.ok) {
        toast.success('AI Draft Plan started!', {
          description: result.jobId ? `Job ID: ${result.jobId}` : undefined,
        });
      } else {
        throw new Error(result?.error || 'Failed to start AI job');
      }
    } catch (err) {
      console.error('[AssignmentEditor] AI Draft failed:', err);
      toast.error('Failed to start AI draft');
    } finally {
      setAiRunning(false);
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
            <Button
              variant="outline"
              onClick={handleDraftPlan}
              disabled={aiRunning}
              data-cta-id="draft-plan"
            >
              {aiRunning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              AI Draft Plan
            </Button>
          )}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <ClipboardList className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle>
                {isNew ? 'New Assignment' : 'Edit Assignment'}
              </CardTitle>
              {!isNew && id && (
                <p className="text-sm text-muted-foreground font-mono">{id}</p>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <EntityForm
              entityName="Assignment"
              initialValues={assignment || {}}
              onSave={handleSave}
              loading={mcpLoading}
            />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

