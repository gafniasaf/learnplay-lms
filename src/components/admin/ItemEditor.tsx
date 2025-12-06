import { useState, useEffect } from "react";
import { X, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StimulusEditor } from "./StimulusEditor";
import { ItemPreview } from "./ItemPreview";
import type { CourseItemV2, CourseGroupV2 } from "@/lib/schemas/courseV2";
import { toast } from "sonner";

interface ItemEditorProps {
  item: CourseItemV2 | null;
  groups: CourseGroupV2[];
  courseId: string;
  open: boolean;
  onClose: () => void;
  onSave: (item: CourseItemV2) => void;
  onDelete?: (itemId: number) => void;
}

export const ItemEditor = ({ item, groups, courseId, open, onClose, onSave, onDelete }: ItemEditorProps) => {
  const [editedItem, setEditedItem] = useState<CourseItemV2 | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    if (item) {
      setEditedItem({ ...item });
      setValidationErrors([]);
    }
  }, [item]);

  if (!editedItem) return null;

  const validate = (): boolean => {
    const errors: string[] = [];

    // Check for exactly one placeholder
    const placeholderCount = (editedItem.text.match(/_|\[blank\]/g) || []).length;
    if (placeholderCount !== 1) {
      errors.push(`Text must contain exactly one placeholder (_ or [blank]), found ${placeholderCount}`);
    }

    // Check for [media] token if inline placement (only on save, not while editing)
    if (editedItem.stimulus?.placement === 'inline') {
      const hasMediaToken = editedItem.text.includes('[media]');
      if (!hasMediaToken) {
        errors.push('Inline media requires [media] token in text - click "Insert [media] token" button below');
      }
    }

    // Check mode-specific fields
    if (editedItem.mode === 'options') {
      if (!editedItem.options || editedItem.options.length < 3 || editedItem.options.length > 4) {
        errors.push('Options mode requires 3-4 options');
      }
      if (editedItem.correctIndex === undefined || editedItem.correctIndex < 0 || editedItem.correctIndex >= (editedItem.options?.length || 0)) {
        errors.push('correctIndex must be a valid option index');
      }
      // Validate optionMedia length matches options
      if (editedItem.optionMedia && editedItem.optionMedia.length !== editedItem.options?.length) {
        // Auto-fix: resize optionMedia array
        const newMedia = Array(editedItem.options?.length || 0).fill(null).map((_, i) => 
          editedItem.optionMedia?.[i] || null
        );
        setEditedItem({ ...editedItem, optionMedia: newMedia as any });
      }
    } else if (editedItem.mode === 'numeric') {
      if (editedItem.answer === undefined || editedItem.answer === null) {
        errors.push('Numeric mode requires an answer');
      }
    }

    if (!editedItem.explain?.trim()) {
      errors.push('Explanation is required');
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSave = () => {
    if (validate()) {
      onSave(editedItem);
      toast.success('Item saved');
      onClose();
    } else {
      toast.error('Please fix validation errors');
    }
  };

  const handleDelete = () => {
    if (onDelete && confirm('Are you sure you want to delete this item?')) {
      onDelete(editedItem.id);
      onClose();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-7xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Item #{editedItem.id}</SheetTitle>
          <SheetDescription>
            Modify item properties and see live preview
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Editor Column */}
          <div className="space-y-6">
          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <ul className="list-disc list-inside">
                  {validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Text (must contain exactly one _ or [blank])</Label>
            <Textarea
              id="item-text-input"
              value={editedItem.text}
              onChange={(e) => setEditedItem({ ...editedItem, text: e.target.value })}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select
                value={editedItem.mode}
                onValueChange={(v: 'options' | 'numeric') => setEditedItem({ ...editedItem, mode: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="options">Options</SelectItem>
                  <SelectItem value="numeric">Numeric</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Group</Label>
              <Select
                value={String(editedItem.groupId)}
                onValueChange={(v) => setEditedItem({ ...editedItem, groupId: parseInt(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {editedItem.mode === 'options' && (
            <div className="space-y-2">
              <Label>Options (3-4 required)</Label>
              {(editedItem.options || []).map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...(editedItem.options || [])];
                      newOpts[i] = e.target.value;
                      setEditedItem({ ...editedItem, options: newOpts });
                    }}
                    placeholder={`Option ${i + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const newOpts = editedItem.options?.filter((_, idx) => idx !== i);
                      setEditedItem({ ...editedItem, options: newOpts });
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {(!editedItem.options || editedItem.options.length < 4) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newOpts = [...(editedItem.options || []), ''];
                    setEditedItem({ ...editedItem, options: newOpts });
                  }}
                >
                  Add Option
                </Button>
              )}
              <div className="space-y-2 mt-2">
                <Label>Correct Index</Label>
                <Input
                  type="number"
                  min="0"
                  max={(editedItem.options?.length || 1) - 1}
                  value={editedItem.correctIndex}
                  onChange={(e) => setEditedItem({ ...editedItem, correctIndex: parseInt(e.target.value) })}
                />
              </div>
            </div>
          )}

          {editedItem.mode === 'numeric' && (
            <div className="space-y-2">
              <Label>Answer</Label>
              <Input
                type="number"
                value={editedItem.answer ?? ''}
                onChange={(e) => setEditedItem({ ...editedItem, answer: parseFloat(e.target.value) })}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Explanation</Label>
            <Textarea
              value={editedItem.explain}
              onChange={(e) => setEditedItem({ ...editedItem, explain: e.target.value })}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Hint (optional)</Label>
            <Input
              value={editedItem.hint || ''}
              onChange={(e) => setEditedItem({ ...editedItem, hint: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cluster ID</Label>
              <Input
                value={editedItem.clusterId}
                onChange={(e) => setEditedItem({ ...editedItem, clusterId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Variant</Label>
              <Select
                value={editedItem.variant}
                onValueChange={(v) => setEditedItem({ ...editedItem, variant: v as "1" | "2" | "3" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Stimulus</Label>
            {editedItem.stimulus && (
              <Badge variant="secondary" className="mb-2">
                {editedItem.stimulus.type}
                {editedItem.stimulus.placement === 'inline' && ' (inline)'}
              </Badge>
            )}
            {editedItem.optionMedia?.some(m => m) && (
              <div className="flex gap-1 mb-2">
                {editedItem.optionMedia.map((media, idx) => 
                  media ? (
                    <Badge key={idx} variant="outline" className="text-xs">
                      Opt {String.fromCharCode(65 + idx)}: {media.type}
                    </Badge>
                  ) : null
                )}
              </div>
            )}
            <StimulusEditor
              courseId={courseId}
              currentStimulus={editedItem.stimulus as any}
              itemMode={editedItem.mode}
              optionLabels={editedItem.options?.map((_, i) => String.fromCharCode(65 + i)) || ['A', 'B', 'C', 'D']}
              onAttach={(stimulus, target) => {
                if (target.type === 'stem') {
                  // Clear validation errors when attaching
                  setValidationErrors([]);
                  setEditedItem({ ...editedItem, stimulus: { ...stimulus, placement: target.placement } as any });
                } else if (target.type === 'option') {
                  const newMedia = Array(editedItem.options?.length || 4).fill(null).map((_, i) => 
                    editedItem.optionMedia?.[i] || null
                  );
                  newMedia[target.index] = stimulus;
                  setEditedItem({ ...editedItem, optionMedia: newMedia as any });
                }
              }}
              onRemove={() => {
                const { stimulus, ...rest } = editedItem;
                setEditedItem(rest as CourseItemV2);
              }}
              onInsertMediaToken={() => {
                const textInput = document.getElementById('item-text-input') as HTMLInputElement;
                const cursorPos = textInput?.selectionStart || editedItem.text.length;
                const newText = editedItem.text.slice(0, cursorPos) + '[media]' + editedItem.text.slice(cursorPos);
                setEditedItem({ ...editedItem, text: newText });
                toast.success('Added [media] token to text');
                // Focus back on the text input
                setTimeout(() => textInput?.focus(), 100);
              }}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} className="flex-1">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            {onDelete && (
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
          </div>

          {/* Preview Column */}
          <div className="lg:sticky lg:top-6 lg:h-fit">
            <ItemPreview item={editedItem} courseTitle={courseId} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
