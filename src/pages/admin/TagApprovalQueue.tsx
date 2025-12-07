/**
 * Tag Approval Queue Page
 * 
 * Admin page for approving AI-suggested tags before publishing courses.
 * Features:
 * - View pending tag suggestions per course
 * - Map suggestions to existing curated tags
 * - Create new tag values inline
 * - Bulk approve/reject
 */

import { useState, useEffect } from 'react';
import { Check, X, Plus, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { OrgConfig } from '@/lib/api/orgConfig';
import { TagApprovalCard } from '@/components/admin/tags/TagApprovalCard';
import { useMCP } from '@/hooks/useMCP';
import { useNavigate } from 'react-router-dom';

interface TagSuggestion {
  id: string;
  courseId: string;
  courseTitle?: string;
  suggestedTags: Record<string, string[]>;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export default function TagApprovalQueue() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [orgConfig, setOrgConfig] = useState<OrgConfig | null>(null);
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const mcp = useMCP();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      
      // Load org config for tag types
      const config = await mcp.getOrgConfig() as OrgConfig;
      setOrgConfig(config);

      const response = await mcp.callGet<any>('lms.listTagSuggestions', { status: filterStatus === 'all' ? undefined : filterStatus });
      const transformed: TagSuggestion[] = (response?.suggestions || []).map((row: any) => ({
        id: row.id,
        courseId: row.courseId || row.course_id,
        courseTitle: row.courseTitle || row.course_id,
        suggestedTags: row.suggestedTags || row.suggested_tags || {},
        status: row.status || 'pending',
        createdAt: row.createdAt || row.created_at,
      }));
      
      setSuggestions(transformed);
    } catch (error: any) {
      if (typeof error?.message === 'string' && error.message.includes('NOT_AUTHENTICATED')) {
        setAuthRequired(true);
      } else {
        console.error('Error loading data:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to load tag approval queue',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  }

  const filteredSuggestions = suggestions.filter(s => {
    if (filterStatus === 'all') return true;
    return s.status === filterStatus;
  });

  const handleApprove = async (suggestionId: string, mappedTags: Record<string, string[]>) => {
    const suggestion = suggestions.find((s) => s.id === suggestionId);
    setApprovingId(suggestionId);
    try {
      await mcp.call('lms.approveTagSuggestion', { suggestionId, mappedTags });

      toast({
        title: 'Tags approved',
        description: `Approved and applied tags for ${suggestion?.courseTitle || suggestionId}`,
      });
      loadData();
    } catch (error) {
      console.error('Failed to approve tags:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to approve tags',
        variant: 'destructive',
      });
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (suggestionId: string) => {
    setRejectingId(suggestionId);
    try {
      await mcp.call('lms.rejectTagSuggestion', { suggestionId });

      toast({
        title: 'Tags rejected',
        description: `Rejected suggestion ${suggestionId}`,
      });
      loadData();
    } catch (error) {
      console.error('Failed to reject tags:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to reject tags',
        variant: 'destructive',
      });
    } finally {
      setRejectingId(null);
    }
  };

  const handleBulkApprove = async () => {
    const pendingIds = filteredSuggestions
      .filter(s => s.status === 'pending')
      .map(s => s.id);

    if (pendingIds.length === 0) {
      toast({
        title: 'No Pending Suggestions',
        description: 'There are no pending suggestions to approve',
      });
      return;
    }

    if (!confirm(`Approve all ${pendingIds.length} pending suggestions?`)) {
      return;
    }

    setBulkApproving(true);
    try {
      // TODO: Bulk approve API call
      toast({
        title: 'Bulk Approve (To be implemented)',
        description: `Would approve ${pendingIds.length} suggestions`,
      });
    } finally {
      setBulkApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading tag approval queue...</div>
        </div>
      </div>
    );
  }

  if (authRequired) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
            <CardDescription>Sign in to view the tag approval queue</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button onClick={() => navigate('/auth')}>Sign in</Button>
            <Button variant="outline" onClick={loadData}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!orgConfig) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>Failed to load tag configuration</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={loadData}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tag Approval Queue</h1>
          <p className="text-muted-foreground mt-1">
            Review and approve AI-suggested tags for courses
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={filterStatus}
            onValueChange={(value: any) => setFilterStatus(value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={loadData} variant="outline">
            Refresh
          </Button>

          {filteredSuggestions.filter(s => s.status === 'pending').length > 0 && (
            <Button onClick={handleBulkApprove} disabled={bulkApproving}>
              {bulkApproving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Approve All Pending
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-3xl">
              {suggestions.filter(s => s.status === 'pending').length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Approved</CardDescription>
            <CardTitle className="text-3xl">
              {suggestions.filter(s => s.status === 'approved').length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Rejected</CardDescription>
            <CardTitle className="text-3xl">
              {suggestions.filter(s => s.status === 'rejected').length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Suggestions List */}
      <div className="space-y-4">
        {filteredSuggestions.map((suggestion) => (
          <TagApprovalCard
            key={suggestion.id}
            suggestion={suggestion}
            orgConfig={orgConfig}
            onApprove={handleApprove}
            onReject={handleReject}
            isApproving={approvingId === suggestion.id}
            isRejecting={rejectingId === suggestion.id}
          />
        ))}

        {filteredSuggestions.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                {filterStatus === 'pending'
                  ? 'No pending tag suggestions'
                  : `No ${filterStatus} suggestions`}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                AI-suggested tags will appear here when courses are generated
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

