/**
 * CourseBlueprintEditor - Edit interface for CourseBlueprint entity
 * 
 * Follows IgniteZero Manifest-First pattern:
 * - Uses MCP for all data operations
 * - Field schema derived from system-manifest.json via contracts.ts
 * - Supports AI course generation and guard checking via agent jobs
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
import { ArrowLeft, BookOpen, Loader2, WandSparkles, ShieldCheck } from 'lucide-react';
import type { CourseBlueprint } from '@/lib/contracts';

export default function CourseBlueprintEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getRecord, saveRecord, enqueueJob, loading: mcpLoading } = useMCP();
  
  const [blueprint, setBlueprint] = useState<Partial<CourseBlueprint> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [guarding, setGuarding] = useState(false);

  const isNew = id === 'new';

  useEffect(() => {
    if (isNew) {
      setBlueprint({ difficulty: 'middle', guard_status: 'pending', published: false });
      setLoading(false);
      return;
    }

    const loadBlueprint = async () => {
      if (!id) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const result = await getRecord('course-blueprint', id) as { record?: CourseBlueprint } | undefined;
        if (result?.record) {
          setBlueprint(result.record);
        } else {
          setError('Course blueprint not found');
        }
      } catch (err) {
        console.error('[CourseBlueprintEditor] Failed to load:', err);
        setError(err instanceof Error ? err.message : 'Failed to load blueprint');
      } finally {
        setLoading(false);
      }
    };

    loadBlueprint();
  }, [id, isNew, getRecord]);

  const handleSave = async (values: Record<string, unknown>) => {
    try {
      const result = await saveRecord('course-blueprint', {
        id: isNew ? crypto.randomUUID() : id,
        ...values,
      }) as { ok?: boolean; id?: string } | undefined;
      
      if (result?.ok) {
        toast.success(isNew ? 'Blueprint created!' : 'Blueprint saved!');
        if (isNew && result.id) {
          navigate(`/workspace/course-blueprint/${result.id}`, { replace: true });
        }
      } else {
        throw new Error('Save failed');
      }
    } catch (err) {
      console.error('[CourseBlueprintEditor] Save failed:', err);
      toast.error('Failed to save blueprint');
      throw err;
    }
  };

  const handleGenerate = async () => {
    if (!blueprint) return;
    
    setGenerating(true);
    try {
      const result = await enqueueJob('ai_course_generate', {
        subject: blueprint.subject,
        difficulty: blueprint.difficulty,
        multimedia_manifest: blueprint.multimedia_manifest,
      });
      
      if (result?.ok) {
        toast.success('AI Course Generation started!', {
          description: result.jobId ? `Job ID: ${result.jobId}` : 'Check AI Pipeline for status.',
        });
      } else {
        throw new Error(result?.error || 'Failed to start generation');
      }
    } catch (err) {
      console.error('[CourseBlueprintEditor] Generate failed:', err);
      toast.error('Failed to start course generation');
    } finally {
      setGenerating(false);
    }
  };

  const handleGuard = async () => {
    if (!blueprint || !id) return;
    
    setGuarding(true);
    try {
      const result = await enqueueJob('guard_course', {
        blueprint_id: id,
        title: blueprint.title,
        subject: blueprint.subject,
      });
      
      if (result?.ok) {
        toast.success('Guard Check started!', {
          description: 'Checking for CTAs, accessibility, and policy compliance.',
        });
      } else {
        throw new Error(result?.error || 'Failed to start guard');
      }
    } catch (err) {
      console.error('[CourseBlueprintEditor] Guard failed:', err);
      toast.error('Failed to start guard check');
    } finally {
      setGuarding(false);
    }
  };

  const getGuardBadge = () => {
    switch (blueprint?.guard_status) {
      case 'passed':
        return <Badge variant="default" className="bg-green-500">Guard Passed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Guard Failed</Badge>;
      default:
        return <Badge variant="secondary">Pending Review</Badge>;
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
              {getGuardBadge()}
              <Button
                variant="outline"
                onClick={handleGuard}
                disabled={guarding}
                data-cta-id="guard-course"
              >
                {guarding ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                Run Guard
              </Button>
              <Button
                variant="outline"
                onClick={handleGenerate}
                disabled={generating}
                data-cta-id="ai-generate"
              >
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <WandSparkles className="mr-2 h-4 w-4" />
                )}
                Generate Course
              </Button>
            </div>
          )}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle>
                {isNew ? 'New Course Blueprint' : 'Edit Course Blueprint'}
              </CardTitle>
              {!isNew && id && (
                <p className="text-sm text-muted-foreground font-mono">{id}</p>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <EntityForm
              entityName="CourseBlueprint"
              initialValues={blueprint || {}}
              onSave={handleSave}
              loading={mcpLoading}
            />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

