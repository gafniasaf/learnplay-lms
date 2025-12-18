import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles } from 'lucide-react';
import type { EditorItem } from '@/lib/editor/types';

type Hints = { nudge?: string; guide?: string; reveal?: string };

interface HintsTabProps {
  item: EditorItem;
  onChange: (updatedItem: EditorItem) => void;
  onAIGenerate?: () => void;
  aiDisabled?: boolean;
}

export const HintsTab = ({ item, onChange, onAIGenerate, aiDisabled }: HintsTabProps) => {
  const hints: Hints = (item as any)?.hints || {};

  const updateHint = (key: keyof Hints, value: string) => {
    const nextHints: Hints = { ...(hints || {}), [key]: value };
    onChange({ ...(item as any), hints: nextHints, hint: (nextHints.nudge || (item as any).hint) } as any);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Progressive Hints</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Provide up to 3 hints that progressively help the student (nudge → guide → reveal).
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            data-cta-id="cta-courseeditor-hints-ai-generate"
            data-action="action"
            disabled={!onAIGenerate || aiDisabled}
            onClick={onAIGenerate}
            className="shadow-sm bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 hover:from-purple-100 hover:to-pink-100"
            title={aiDisabled ? 'Save or discard unsaved changes before generating' : 'Generate hints with AI'}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
            <span className="text-purple-700">AI Generate</span>
          </Button>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <Label className="text-sm">Nudge (Hint 1)</Label>
            <p className="text-xs text-muted-foreground">
              Gentle reminder of the concept. Avoid giving away the answer.
            </p>
            <Textarea
              value={String(hints.nudge ?? '')}
              onChange={(e) => updateHint('nudge', e.target.value)}
              placeholder="Example: Focus on what the term 'anterior' means."
              className="min-h-[84px]"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Guide (Hint 2)</Label>
            <p className="text-xs text-muted-foreground">
              More specific direction toward the correct reasoning path.
            </p>
            <Textarea
              value={String(hints.guide ?? '')}
              onChange={(e) => updateHint('guide', e.target.value)}
              placeholder="Example: In anatomy, 'anterior' refers to the front side of the body."
              className="min-h-[92px]"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Reveal (Hint 3)</Label>
            <p className="text-xs text-muted-foreground">
              Nearly gives it away without saying “the answer is X”.
            </p>
            <Textarea
              value={String(hints.reveal ?? '')}
              onChange={(e) => updateHint('reveal', e.target.value)}
              placeholder="Example: 'Anterior' literally means 'front'."
              className="min-h-[92px]"
            />
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Student Preview</h3>
          <p className="text-xs text-gray-500 mt-0.5">How hints will appear when the student asks for help.</p>
        </div>
        <div className="p-6 space-y-3">
          {hints.nudge && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
              <span className="font-medium">Hint 1:</span> {hints.nudge}
            </div>
          )}
          {hints.guide && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <span className="font-medium">Hint 2:</span> {hints.guide}
            </div>
          )}
          {hints.reveal && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm">
              <span className="font-medium">Hint 3:</span> {hints.reveal}
            </div>
          )}
          {!hints.nudge && !hints.guide && !hints.reveal && (
            <div className="text-sm text-muted-foreground">
              No hints yet. Add at least a <b>Nudge</b>, or click <b>AI Generate</b>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


