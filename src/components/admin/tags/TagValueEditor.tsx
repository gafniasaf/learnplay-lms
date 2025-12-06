/**
 * TagValueEditor Component
 * 
 * Edit tag values for a specific tag type
 */

import { useState } from 'react';
import { Trash2, Edit2, Check, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useMCP } from '@/hooks/useMCP';

interface TagValue {
  id: string;
  value: string;
  slug: string;
}

interface TagType {
  key: string;
  label: string;
  tags: TagValue[];
}

interface TagValueEditorProps {
  tagType: TagType;
  onUpdate: () => void;
}

export function TagValueEditor({ tagType, onUpdate }: TagValueEditorProps) {
  const { toast } = useToast();
  const mcp = useMCP();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newValue, setNewValue] = useState('');

  const handleStartEdit = (tag: TagValue) => {
    setEditingId(tag.id);
    setEditValue(tag.value);
  };

  const handleSaveEdit = async (tagId: string) => {
    try {
      const slug = editValue.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      // Update via MCP
      await mcp.saveRecord('Tag', {
        id: tagId,
        value: editValue,
        slug,
      });

      toast({
        title: 'Tag updated',
        description: `Updated to "${editValue}"`,
      });
      setEditingId(null);
      onUpdate();
    } catch (error) {
      console.error('Failed to update tag:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update tag',
        variant: 'destructive',
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleDelete = async (tagId: string, tagValue: string) => {
    if (!confirm(`Delete tag value "${tagValue}"?`)) {
      return;
    }

    try {
      // Deactivate via MCP
      await mcp.saveRecord('Tag', {
        id: tagId,
        is_active: false,
      });

      toast({
        title: 'Tag deactivated',
        description: `Deactivated "${tagValue}"`,
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to delete tag:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete tag',
        variant: 'destructive',
      });
    }
  };

  const handleAddTag = async () => {
    if (!newValue.trim()) {
      return;
    }

    try {
      const slug = newValue.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      // Insert new tag via MCP
      await mcp.saveRecord('Tag', {
        type_key: tagType.key,
        value: newValue.trim(),
        slug,
        is_active: true,
      });

      toast({
        title: 'Tag added',
        description: `Added "${newValue}" to ${tagType.label}`,
      });

      setIsAdding(false);
      setNewValue('');
      onUpdate();
    } catch (error) {
      console.error('Failed to add tag:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add tag',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* Existing Tags */}
      <div className="grid gap-2">
        {tagType.tags.map((tag) => (
          <div
            key={tag.id}
            className="flex items-center gap-3 p-3 rounded-md border bg-background"
          >
            {editingId === tag.id ? (
              <>
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="flex-1"
                  autoFocus
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleSaveEdit(tag.id)}
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
              </>
            ) : (
              <>
                <div className="flex-1">
                  <span className="font-medium">{tag.value}</span>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {tag.slug}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleStartEdit(tag)}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(tag.id, tag.value)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        ))}

        {tagType.tags.length === 0 && !isAdding && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No tag values yet</p>
          </div>
        )}
      </div>

      {/* Add New Tag Form */}
      {isAdding ? (
        <div className="flex items-center gap-2 p-3 rounded-md border border-dashed">
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Enter tag value..."
            className="flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddTag();
              } else if (e.key === 'Escape') {
                setIsAdding(false);
                setNewValue('');
              }
            }}
          />
          <Button size="sm" onClick={handleAddTag}>
            <Check className="h-4 w-4 mr-2" />
            Add
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setIsAdding(false);
              setNewValue('');
            }}
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Tag Value
        </Button>
      )}
    </div>
  );
}

