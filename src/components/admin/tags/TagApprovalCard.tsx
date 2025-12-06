/**
 * TagApprovalCard Component
 * 
 * Individual card for approving/rejecting AI-suggested tags
 */

import { useState } from 'react';
import { Check, X, ExternalLink, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { OrgConfig } from '@/lib/api/orgConfig';

interface TagSuggestion {
  id: string;
  courseId: string;
  courseTitle?: string;
  suggestedTags: Record<string, string[]>;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

interface TagApprovalCardProps {
  suggestion: TagSuggestion;
  orgConfig: OrgConfig;
  onApprove: (suggestionId: string, mappedTags: Record<string, string[]>) => void;
  onReject: (suggestionId: string) => void;
  isApproving?: boolean;
  isRejecting?: boolean;
}

export function TagApprovalCard({
  suggestion,
  orgConfig,
  onApprove,
  onReject,
  isApproving = false,
  isRejecting = false,
}: TagApprovalCardProps) {
  const { toast } = useToast();
  const [mappedTags, setMappedTags] = useState<Record<string, string[]>>({});
  const [newTagValues, setNewTagValues] = useState<Record<string, string>>({});
  const [creatingNew, setCreatingNew] = useState<Record<string, boolean>>({});

  const handleMapTag = (typeKey: string, aiValue: string, curatedSlug: string) => {
    setMappedTags(prev => ({
      ...prev,
      [typeKey]: [...(prev[typeKey] || []).filter(v => v !== aiValue), curatedSlug],
    }));
  };

  const handleCreateNew = (typeKey: string, aiValue: string) => {
    setCreatingNew(prev => ({ ...prev, [`${typeKey}:${aiValue}`]: true }));
  };

  const handleSaveNewTag = async (typeKey: string, aiValue: string) => {
    const newValue = newTagValues[`${typeKey}:${aiValue}`];
    if (!newValue?.trim()) return;

    const slug = newValue.toLowerCase().replace(/\s+/g, '-');
    try {
      const { error } = await supabase.from('tags').insert({
        type_key: typeKey,
        value: newValue,
        slug,
        is_active: true
      }).select().single();
      
      if (error) throw error;
      
      handleMapTag(typeKey, aiValue, slug);
    } catch (e) {
      toast({
        title: 'Error',
        description: 'Failed to create tag',
        variant: 'destructive'
      });
      return;
    }
    
    setCreatingNew(prev => ({ ...prev, [`${typeKey}:${aiValue}`]: false }));
    setNewTagValues(prev => ({ ...prev, [`${typeKey}:${aiValue}`]: '' }));
  };

  const handleApprove = () => {
    onApprove(suggestion.id, mappedTags);
  };

  const getStatusBadge = () => {
    switch (suggestion.status) {
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      case 'approved':
        return <Badge variant="default">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              {suggestion.courseTitle || suggestion.courseId}
              <a
                href={`/admin/editor/${suggestion.courseId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </CardTitle>
            <CardDescription>
              Course ID: {suggestion.courseId} • {getStatusBadge()}
            </CardDescription>
          </div>

          {suggestion.status === 'pending' && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReject(suggestion.id)}
                disabled={isApproving || isRejecting}
              >
                {isRejecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Rejecting...
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4 mr-2" />
                    Reject
                  </>
                )}
              </Button>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isApproving || isRejecting}
              >
                {isApproving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Approving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Approve
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {Object.entries(suggestion.suggestedTags).map(([typeKey, aiValues]) => {
          const tagType = orgConfig.tagTypes.find(t => t.key === typeKey);
          if (!tagType) return null;

          return (
            <div key={typeKey} className="space-y-2">
              <h4 className="font-medium text-sm">{tagType.label}</h4>
              <div className="space-y-2 pl-4">
                {aiValues.map((aiValue, idx) => {
                  const isCreating = creatingNew[`${typeKey}:${aiValue}`];
                  
                  return (
                    <div key={idx} className="flex items-center gap-3">
                      <Badge variant="secondary" className="min-w-[120px]">
                        AI: {aiValue}
                      </Badge>
                      <span className="text-muted-foreground">→</span>

                      {isCreating ? (
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            placeholder="New tag value..."
                            value={newTagValues[`${typeKey}:${aiValue}`] || ''}
                            onChange={(e) =>
                              setNewTagValues(prev => ({
                                ...prev,
                                [`${typeKey}:${aiValue}`]: e.target.value,
                              }))
                            }
                            className="max-w-xs"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSaveNewTag(typeKey, aiValue)}
                          >
                            Create
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setCreatingNew(prev => ({
                                ...prev,
                                [`${typeKey}:${aiValue}`]: false,
                              }))
                            }
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Select
                            value={mappedTags[typeKey]?.find(v => v === aiValue) || ''}
                            onValueChange={(value) => handleMapTag(typeKey, aiValue, value)}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Map to existing..." />
                            </SelectTrigger>
                            <SelectContent>
                              {tagType.tags.map((tag) => (
                                <SelectItem key={tag.id} value={tag.slug}>
                                  {tag.value}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCreateNew(typeKey, aiValue)}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Create New
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {Object.keys(suggestion.suggestedTags).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No tags suggested
          </p>
        )}
      </CardContent>
    </Card>
  );
}


