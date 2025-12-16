import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';

interface ComparePanelProps {
  original: string | null;
  proposed: string | null;
  type: 'text' | 'media';
  onAdopt: () => void;
  onReject: () => void;
  label?: string;
}

export const ComparePanel = ({
  original,
  proposed,
  type: _type,
  onAdopt,
  onReject,
  label = 'AI Suggestion',
}: ComparePanelProps) => {
  if (!proposed) return null;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 border-b bg-white/80 backdrop-blur">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
          {label}
        </h4>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Original */}
          <div>
            <div className="text-sm font-medium text-gray-600 mb-1.5">Original</div>
            <div className="bg-white border border-gray-200 rounded-md p-3 text-sm leading-relaxed whitespace-pre-wrap break-words max-h-[34vh] lg:max-h-none overflow-auto">
              {original || <span className="text-muted-foreground italic">No content</span>}
            </div>
          </div>

          {/* Proposed */}
          <div>
            <div className="text-sm font-medium text-gray-600 mb-1.5">Proposed</div>
            <div className="bg-purple-50 border-2 border-primary rounded-md p-3 text-sm leading-relaxed whitespace-pre-wrap break-words max-h-[34vh] lg:max-h-none overflow-auto">
              {proposed}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 border-t bg-white">
        <div className="flex gap-2">
          <Button variant="default" size="sm" className="flex-1" onClick={onAdopt}>
            <Check className="h-4 w-4 mr-1.5" />
            Adopt
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={onReject}>
            <X className="h-4 w-4 mr-1.5" />
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
};

