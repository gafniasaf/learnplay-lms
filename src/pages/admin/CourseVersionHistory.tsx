/**
 * Course Version History Page
 * 
 * View and manage course version snapshots
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, RotateCcw, Eye, User, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
// restoreCourseVersion now via useMCP
import { useMCP } from '@/hooks/useMCP';

interface CourseVersion {
  id: string;
  version: number;
  published_at: string;
  published_by: string;
  change_summary: string;
  metadata_snapshot: any;
}

export default function CourseVersionHistory() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const mcp = useMCP();

  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<CourseVersion[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any>(null);
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const loadVersions = useCallback(async () => {
    if (!courseId) return;

    try {
      setLoading(true);

      const response = await mcp.callGet<any>('lms.listCourseVersions', { courseId });
      const items = (response?.versions || response?.items || []) as CourseVersion[];
      setVersions(items);
    } catch (error: any) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [courseId, mcp, toast]);

  useEffect(() => {
    if (courseId) {
      loadVersions();
    }
  }, [courseId, loadVersions]);

  async function handleViewSnapshot(version: number) {
    if (!courseId) return;

    try {
      const response = await mcp.callGet<any>('lms.getCourseVersionSnapshot', { courseId, version: String(version) });
      const snapshot = response?.metadata_snapshot ?? response?.snapshot ?? response;
      setSelectedSnapshot(snapshot);
      setShowSnapshotDialog(true);
    } catch (error: any) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  }

  async function handleRestore(version: number) {
    if (!courseId) return;

    const changelog = prompt(`Enter changelog for restoring to version ${version}:`);
    if (!changelog) return;

    try {
      setRestoring(true);

      const result = await mcp.restoreCourseVersion(courseId, version);

      toast({
        title: 'Version Restored',
        description: `Created version ${result.newVersion} from version ${version}`,
      });

      // Reload versions
      loadVersions();
    } catch (error: any) {
      console.error('Error restoring version:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to restore version',
        variant: 'destructive',
      });
    } finally {
      setRestoring(false);
    }
  }

  if (!courseId) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>Course ID not provided</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Version History</h1>
          <p className="text-muted-foreground mt-1">
            Course: {courseId}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/admin/editor/${courseId}`)}>
            Back to Editor
          </Button>
          <Button variant="outline" onClick={loadVersions}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Versions List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">Loading versions...</div>
        </div>
      ) : versions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No published versions yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Publish the course from the editor to create the first version
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {versions.map((v) => (
            <Card key={v.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <Badge variant={v.version === versions[0].version ? 'default' : 'outline'}>
                        Version {v.version}
                      </Badge>
                      {v.version === versions[0].version && (
                        <Badge variant="secondary">Current</Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-2 space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-3 w-3" />
                        {new Date(v.published_at).toLocaleString()}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-3 w-3" />
                        {v.published_by || 'Unknown'}
                      </div>
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewSnapshot(v.version)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Snapshot
                    </Button>
                    {v.version !== versions[0].version && (
                      <Button
                        size="sm"
                        onClick={() => handleRestore(v.version)}
                        disabled={restoring}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Restore
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              {v.change_summary && (
                <CardContent>
                  <div className="text-sm">
                    <strong>Summary:</strong> {v.change_summary}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Snapshot Dialog */}
      <Dialog open={showSnapshotDialog} onOpenChange={setShowSnapshotDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5" />
              Version Snapshot
            </DialogTitle>
            <DialogDescription>
              Complete course JSON at this version
            </DialogDescription>
          </DialogHeader>
          <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs">
            {JSON.stringify(selectedSnapshot, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

