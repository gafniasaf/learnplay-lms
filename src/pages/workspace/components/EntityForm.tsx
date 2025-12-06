/**
 * EntityForm - Dynamic form generator based on system-manifest.json schema
 * 
 * This component reads field definitions from contracts.ts (auto-generated from manifest)
 * and renders appropriate form controls for each field type.
 */

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ENTITY_FIELDS } from '@/lib/contracts';
import { Loader2, Save, Sparkles } from 'lucide-react';

type FieldDef = {
  key: string;
  type: string;
  options?: readonly string[];
  required?: boolean;
  description?: string;
};

interface EntityFormProps {
  entityName: keyof typeof ENTITY_FIELDS;
  initialValues?: Record<string, unknown>;
  onSave: (values: Record<string, unknown>) => Promise<void>;
  onAIAssist?: (fieldKey: string, currentValue: unknown) => Promise<string>;
  loading?: boolean;
  title?: string;
}

export function EntityForm({
  entityName,
  initialValues = {},
  onSave,
  onAIAssist,
  loading = false,
  title,
}: EntityFormProps) {
  const fields = ENTITY_FIELDS[entityName] as readonly FieldDef[];
  const [values, setValues] = useState<Record<string, unknown>>(initialValues);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  const handleChange = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(values);
    } finally {
      setSaving(false);
    }
  };

  const handleAIAssist = async (fieldKey: string) => {
    if (!onAIAssist) return;
    setAiLoading(fieldKey);
    try {
      const suggestion = await onAIAssist(fieldKey, values[fieldKey]);
      handleChange(fieldKey, suggestion);
    } finally {
      setAiLoading(null);
    }
  };

  const renderField = (field: FieldDef) => {
    const value = values[field.key];
    const id = `field-${field.key}`;

    switch (field.type) {
      case 'string':
        return (
          <div key={field.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={id} className="text-sm font-medium">
                {formatLabel(field.key)}
              </Label>
              {onAIAssist && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAIAssist(field.key)}
                  disabled={aiLoading === field.key}
                  className="h-6 px-2 text-xs"
                >
                  {aiLoading === field.key ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                </Button>
              )}
            </div>
            <Input
              id={id}
              value={(value as string) || ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
              placeholder={field.description || `Enter ${formatLabel(field.key).toLowerCase()}`}
            />
          </div>
        );

      case 'number':
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={id} className="text-sm font-medium">
              {formatLabel(field.key)}
            </Label>
            <Input
              id={id}
              type="number"
              value={(value as number) || ''}
              onChange={(e) => handleChange(field.key, parseFloat(e.target.value) || 0)}
              placeholder={field.description}
            />
          </div>
        );

      case 'boolean':
        return (
          <div key={field.key} className="flex items-center justify-between py-2">
            <Label htmlFor={id} className="text-sm font-medium">
              {formatLabel(field.key)}
            </Label>
            <Switch
              id={id}
              checked={!!value}
              onCheckedChange={(checked) => handleChange(field.key, checked)}
            />
          </div>
        );

      case 'enum':
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={id} className="text-sm font-medium">
              {formatLabel(field.key)}
            </Label>
            <Select
              value={(value as string) || ''}
              onValueChange={(v) => handleChange(field.key, v)}
            >
              <SelectTrigger id={id}>
                <SelectValue placeholder={`Select ${formatLabel(field.key).toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {formatLabel(opt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case 'date':
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={id} className="text-sm font-medium">
              {formatLabel(field.key)}
            </Label>
            <Input
              id={id}
              type="datetime-local"
              value={(value as string)?.slice(0, 16) || ''}
              onChange={(e) => handleChange(field.key, new Date(e.target.value).toISOString())}
            />
          </div>
        );

      case 'json':
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={id} className="text-sm font-medium">
              {formatLabel(field.key)} (JSON)
            </Label>
            <Textarea
              id={id}
              value={typeof value === 'object' ? JSON.stringify(value, null, 2) : (value as string) || ''}
              onChange={(e) => {
                try {
                  handleChange(field.key, JSON.parse(e.target.value));
                } catch {
                  // Keep as string if invalid JSON
                  handleChange(field.key, e.target.value);
                }
              }}
              placeholder="{}"
              className="font-mono text-sm"
              rows={4}
            />
          </div>
        );

      default:
        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={id} className="text-sm font-medium">
              {formatLabel(field.key)}
            </Label>
            <Input
              id={id}
              value={String(value || '')}
              onChange={(e) => handleChange(field.key, e.target.value)}
            />
          </div>
        );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {title && (
        <div className="border-b pb-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Edit {formatLabel(entityName)} details
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {fields.map(renderField)}
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="submit" disabled={saving || loading}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save {formatLabel(entityName)}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

