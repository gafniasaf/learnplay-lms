/**
 * Tag Management Page
 * 
 * Admin page for managing curated tag types and tag values.
 * Features:
 * - View tag types (domain, level, theme, etc.)
 * - Enable/disable tag types
 * - Reorder tag types (display order)
 * - Rename tag type labels
 * - CRUD for tag values per type
 * - Activate/deactivate tag values
 */

import { useState, useEffect } from 'react';
import { Plus, Settings, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useMCP } from '@/hooks/useMCP';
import type { OrgConfig } from '@/lib/api/orgConfig';
import { TagTypeManager } from '@/components/admin/tags/TagTypeManager';
import { TagValueEditor } from '@/components/admin/tags/TagValueEditor';
import { useNavigate } from 'react-router-dom';

export default function TagManagement() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const mcp = useMCP();
  const [loading, setLoading] = useState(true);
  const [orgConfig, setOrgConfig] = useState<OrgConfig | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    loadOrgConfig();
  }, []);

  async function loadOrgConfig() {
    try {
      setLoading(true);
      const config = await mcp.getOrgConfig() as OrgConfig;
      setOrgConfig(config);
      setAuthRequired(false);
      
      // Expand first tag type by default
      if (config.tagTypes.length > 0) {
        setExpandedTypes(new Set([config.tagTypes[0].key]));
      }
    } catch (error: any) {
      if (typeof error?.message === 'string' && error.message.includes('NOT_AUTHENTICATED')) {
        setAuthRequired(true);
      } else {
        console.error('Error loading org config:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to load tag configuration',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  }

  const toggleExpanded = (typeKey: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(typeKey)) {
        next.delete(typeKey);
      } else {
        next.add(typeKey);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading tag configuration...</div>
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
            <CardDescription>Sign in to view and manage organization tags</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button onClick={() => navigate('/auth')}>Sign in</Button>
            <Button variant="outline" onClick={loadOrgConfig}>Retry</Button>
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
            <Button onClick={loadOrgConfig}>Retry</Button>
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
          <h1 className="text-3xl font-bold">Tag Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage curated tag types and values for {orgConfig.organization.name}
          </p>
        </div>
        <Button onClick={loadOrgConfig} variant="outline">
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="types" className="space-y-6">
        <TabsList>
          <TabsTrigger value="types">Tag Types</TabsTrigger>
          <TabsTrigger value="values">Tag Values</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Tag Types Tab */}
        <TabsContent value="types" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tag Types</CardTitle>
              <CardDescription>
                Manage tag categories (domain, level, theme, etc.). Enable/disable and reorder types.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TagTypeManager
                tagTypes={orgConfig.tagTypes}
                onUpdate={loadOrgConfig}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tag Values Tab */}
        <TabsContent value="values" className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">Tag Values</h2>
              <p className="text-sm text-muted-foreground">
                Manage allowed values for each tag type
              </p>
            </div>
          </div>

          {orgConfig.tagTypes
            .filter(type => type.isEnabled)
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map(tagType => (
              <Card key={tagType.key}>
                <CardHeader
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleExpanded(tagType.key)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {expandedTypes.has(tagType.key) ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <CardTitle>{tagType.label}</CardTitle>
                        <CardDescription>
                          {tagType.tags.length} value{tagType.tags.length !== 1 ? 's' : ''}
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        // TODO: Open add tag value dialog
                        toast({
                          title: 'Add Tag Value',
                          description: 'Dialog to add tag value (to be implemented)',
                        });
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Value
                    </Button>
                  </div>
                </CardHeader>

                {expandedTypes.has(tagType.key) && (
                  <CardContent>
                    <TagValueEditor
                      tagType={tagType}
                      onUpdate={loadOrgConfig}
                    />
                  </CardContent>
                )}
              </Card>
            ))}

          {orgConfig.tagTypes.filter(t => t.isEnabled).length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No tag types enabled</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Enable tag types in the "Tag Types" tab
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Tag Settings</CardTitle>
              <CardDescription>
                Configure tag system behavior and defaults
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4">
                <h3 className="font-medium mb-2">Current Configuration</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Organization:</dt>
                    <dd className="font-medium">{orgConfig.organization.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Total Tag Types:</dt>
                    <dd className="font-medium">{orgConfig.tagTypes.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Enabled Types:</dt>
                    <dd className="font-medium">
                      {orgConfig.tagTypes.filter(t => t.isEnabled).length}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Total Tag Values:</dt>
                    <dd className="font-medium">
                      {orgConfig.tagTypes.reduce((sum, t) => sum + t.tags.length, 0)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Additional settings coming soon</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

