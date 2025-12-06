/**
 * TagTypeManager Component
 * 
 * Manages tag types: enable/disable, reorder, rename labels
 */

import { useState } from 'react';
import { GripVertical, Eye, EyeOff, Edit2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useMCP } from '@/hooks/useMCP';

interface TagType {
  key: string;
  label: string;
  isEnabled: boolean;
  displayOrder: number;
  tags: Array<{ id: string; value: string; slug: string }>;
}

interface TagTypeManagerProps {
  tagTypes: TagType[];
  onUpdate: () => void;
}

export function TagTypeManager({ tagTypes, onUpdate }: TagTypeManagerProps) {
  const { toast } = useToast();
  const mcp = useMCP();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const sortedTypes = [...tagTypes].sort((a, b) => a.displayOrder - b.displayOrder);

  const handleToggleEnabled = async (typeKey: string) => {
    try {
      // Get current state via MCP
      const currentResponse = await mcp.getRecord('TagType', typeKey) as unknown as { record?: { is_enabled?: boolean } };
      const current = currentResponse?.record;

      if (!current) {
        throw new Error('Tag type not found');
      }

      // Toggle via MCP
      await mcp.saveRecord('TagType', {
        key: typeKey,
        is_enabled: !current.is_enabled,
      });

      toast({
        title: 'Tag type updated',
        description: `${typeKey} ${current.is_enabled ? 'disabled' : 'enabled'}`,
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to toggle tag type:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to toggle tag type',
        variant: 'destructive',
      });
    }
  };

  const handleStartEdit = (tagType: TagType) => {
    setEditingKey(tagType.key);
    setEditLabel(tagType.label);
  };

  const handleSaveEdit = async (typeKey: string) => {
    try {
      // Update via MCP
      await mcp.saveRecord('TagType', {
        key: typeKey,
        label: editLabel.trim(),
      });

      toast({
        title: 'Label updated',
        description: `Updated ${typeKey} label to "${editLabel}"`,
      });
      setEditingKey(null);
      onUpdate();
    } catch (error) {
      console.error('Failed to update label:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update label',
        variant: 'destructive',
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditLabel('');
  };

  return (
    <div className="space-y-2">
      {sortedTypes.map((tagType) => (
        <div
          key={tagType.key}
          className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
        >
          {/* Drag Handle */}
          <div className="cursor-grab text-muted-foreground hover:text-foreground">
            <GripVertical className="h-5 w-5" />
          </div>

          {/* Tag Type Info */}
          <div className="flex-1">
            {editingKey === tagType.key ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="max-w-xs"
                  autoFocus
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleSaveEdit(tagType.key)}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelEdit}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h3 className="font-medium">{tagType.label}</h3>
                <Badge variant="outline" className="text-xs">
                  {tagType.key}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {tagType.tags.length} value{tagType.tags.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {editingKey !== tagType.key && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleStartEdit(tagType)}
                  title="Rename label"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>

                <Button
                  size="sm"
                  variant={tagType.isEnabled ? 'default' : 'outline'}
                  onClick={() => handleToggleEnabled(tagType.key)}
                  title={tagType.isEnabled ? 'Disable' : 'Enable'}
                >
                  {tagType.isEnabled ? (
                    <>
                      <Eye className="h-4 w-4 mr-2" />
                      Enabled
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-4 w-4 mr-2" />
                      Disabled
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      ))}

      {tagTypes.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No tag types found</p>
        </div>
      )}
    </div>
  );
}

