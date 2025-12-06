/**
 * LearnerProfileEditor - Edit interface for LearnerProfile entity
 * 
 * Follows IgniteZero Manifest-First pattern:
 * - Uses MCP for all data operations
 * - Field schema derived from system-manifest.json via contracts.ts
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMCP } from '@/hooks/useMCP';
import { EntityForm } from './components/EntityForm';
import { toast } from 'sonner';
import { ArrowLeft, User, Loader2 } from 'lucide-react';
import type { LearnerProfile } from '@/lib/contracts';

export default function LearnerProfileEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getRecord, saveRecord, loading: mcpLoading } = useMCP();
  
  const [profile, setProfile] = useState<Partial<LearnerProfile> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isNew = id === 'new';

  useEffect(() => {
    if (isNew) {
      setProfile({});
      setLoading(false);
      return;
    }

    const loadProfile = async () => {
      if (!id) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const result = await getRecord('learner-profile', id) as { record?: LearnerProfile } | undefined;
        if (result?.record) {
          setProfile(result.record);
        } else {
          setError('Profile not found');
        }
      } catch (err) {
        console.error('[LearnerProfileEditor] Failed to load:', err);
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [id, isNew, getRecord]);

  const handleSave = async (values: Record<string, unknown>) => {
    try {
      const result = await saveRecord('learner-profile', {
        id: isNew ? crypto.randomUUID() : id,
        ...values,
      }) as { ok?: boolean; id?: string } | undefined;
      
      if (result?.ok) {
        toast.success(isNew ? 'Profile created!' : 'Profile saved!');
        if (isNew && result.id) {
          navigate(`/workspace/learner-profile/${result.id}`, { replace: true });
        }
      } else {
        throw new Error('Save failed');
      }
    } catch (err) {
      console.error('[LearnerProfileEditor] Save failed:', err);
      toast.error('Failed to save profile');
      throw err;
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
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle>
                {isNew ? 'New Learner Profile' : 'Edit Learner Profile'}
              </CardTitle>
              {!isNew && id && (
                <p className="text-sm text-muted-foreground font-mono">{id}</p>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <EntityForm
              entityName="LearnerProfile"
              initialValues={profile || {}}
              onSave={handleSave}
              loading={mcpLoading}
            />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

