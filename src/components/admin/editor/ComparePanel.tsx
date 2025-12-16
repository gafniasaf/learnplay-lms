import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Check, X, FileText, Image, Layers, Sparkles, Equal } from 'lucide-react';

interface ComparePanelProps {
  original: string | null;
  proposed: string | null;
  type: 'text' | 'media';
  onAdopt: () => void;
  onReject: () => void;
  label?: string;
}

// Parse content to extract sections and images for summary
function parseContentSummary(text: string) {
  const sections = (text.match(/\[SECTION:[^\]]*\]/g) || []).map(s => s.replace(/\[SECTION:|]/g, ''));
  const images = (text.match(/\[IMAGE:[^\]]*\]/g) || []).length;
  const plainText = text
    .replace(/\[SECTION:[^\]]*\]/g, '')
    .replace(/\[IMAGE:[^\]]*\]/g, '')
    .trim();
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  return { sections, images, wordCount };
}

// Render content with visual markers
function RenderFormattedContent({ text }: { text: string }) {
  if (!text) {
    return <span className="text-muted-foreground italic">No content</span>;
  }

  const lines = text.split('\n');
  
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        
        // Section marker
        const sectionMatch = trimmed.match(/^\[SECTION:(.*?)\]$/);
        if (sectionMatch) {
          return (
            <div key={i} className="flex items-center gap-2 py-1">
              <Layers className="h-4 w-4 text-blue-600 flex-shrink-0" />
              <span className="font-semibold text-blue-900 bg-blue-50 px-2 py-0.5 rounded text-sm">
                {sectionMatch[1] || 'Untitled Section'}
              </span>
            </div>
          );
        }
        
        // Image marker
        const imageMatch = trimmed.match(/^\[IMAGE:(.*?)\]$/);
        if (imageMatch) {
          const isUrl = /^https?:\/\//i.test(imageMatch[1]);
          return (
            <div key={i} className="flex items-center gap-2 py-1">
              <Image className="h-4 w-4 text-purple-600 flex-shrink-0" />
              <span className={cn(
                "px-2 py-0.5 rounded text-sm",
                isUrl 
                  ? "text-purple-700 bg-purple-50 font-mono text-xs truncate max-w-[300px]" 
                  : "text-purple-600 bg-purple-50/50 italic"
              )}>
                {isUrl ? '🖼️ Generated image' : `📝 ${imageMatch[1]}`}
              </span>
            </div>
          );
        }
        
        // Empty line
        if (!trimmed) {
          return <div key={i} className="h-2" />;
        }
        
        // Regular text
        return (
          <p key={i} className="text-sm text-gray-700 leading-relaxed">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

// Simple line-by-line diff
function computeSimpleDiff(original: string, proposed: string) {
  const aLines = original.split('\n');
  const bLines = proposed.split('\n');
  
  const result: Array<{ type: 'same' | 'added' | 'removed' | 'changed'; original?: string; proposed?: string }> = [];
  
  const maxLen = Math.max(aLines.length, bLines.length);
  
  for (let i = 0; i < maxLen; i++) {
    const a = aLines[i];
    const b = bLines[i];
    
    if (a === b) {
      result.push({ type: 'same', original: a });
    } else if (a === undefined) {
      result.push({ type: 'added', proposed: b });
    } else if (b === undefined) {
      result.push({ type: 'removed', original: a });
    } else {
      result.push({ type: 'changed', original: a, proposed: b });
    }
  }
  
  return result;
}

export const ComparePanel = ({
  original,
  proposed,
  type: _type,
  onAdopt,
  onReject,
  label = 'AI Suggestion',
}: ComparePanelProps) => {
  if (proposed === null) return null;

  const originalText = original ?? '';
  const proposedText = proposed ?? '';
  const hasChanges = originalText.trim() !== proposedText.trim();
  
  const originalSummary = useMemo(() => parseContentSummary(originalText), [originalText]);
  const proposedSummary = useMemo(() => parseContentSummary(proposedText), [proposedText]);
  
  const diff = useMemo(() => computeSimpleDiff(originalText, proposedText), [originalText, proposedText]);
  const changedLines = diff.filter(d => d.type !== 'same').length;

  // No changes state - make it prominent
  if (!hasChanges) {
    return (
      <div className="flex flex-col h-full bg-gradient-to-b from-gray-50 to-white">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b bg-white/80 backdrop-blur flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-900">{label}</h4>
          <Button
            variant="ghost"
            size="sm"
            data-cta-id="cta-compare-close"
            data-action="close_modal"
            onClick={onReject}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {/* No Changes Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Equal className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Changes Detected</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            The AI suggestion is identical to your current content. No modifications needed.
          </p>
          <Button
            variant="outline"
            data-cta-id="cta-compare-dismiss"
            data-action="close_modal"
            onClick={onReject}
          >
            Dismiss
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900">{label}</h4>
              <p className="text-xs text-muted-foreground">Review the AI's suggested changes</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            data-cta-id="cta-compare-close"
            data-action="close_modal"
            onClick={onReject}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Change Summary */}
        <div className="flex items-center gap-4 text-xs">
          <Badge variant="outline" className="gap-1.5 font-normal">
            <span className="text-rose-600 font-mono">−{diff.filter(d => d.type === 'removed' || d.type === 'changed').length}</span>
            <span className="text-emerald-600 font-mono">+{diff.filter(d => d.type === 'added' || d.type === 'changed').length}</span>
            <span className="text-muted-foreground">lines changed</span>
          </Badge>
          {proposedSummary.sections.length !== originalSummary.sections.length && (
            <span className="text-muted-foreground">
              {proposedSummary.sections.length} sections
            </span>
          )}
          {proposedSummary.images !== originalSummary.images && (
            <span className="text-muted-foreground">
              {proposedSummary.images} images
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Tabs defaultValue="sideBySide" className="h-full flex flex-col">
          <div className="px-6 pt-3">
            <TabsList className="grid w-full grid-cols-3 max-w-md">
              <TabsTrigger
                value="sideBySide"
                data-cta-id="cta-compare-tab-sidebyside"
                data-action="tab"
                className="text-xs"
              >
                Side by Side
              </TabsTrigger>
              <TabsTrigger
                value="diff"
                data-cta-id="cta-compare-tab-diff"
                data-action="tab"
                className="text-xs"
              >
                Unified Diff
              </TabsTrigger>
              <TabsTrigger
                value="proposed"
                data-cta-id="cta-compare-tab-proposed"
                data-action="tab"
                className="text-xs"
              >
                Preview New
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Side by Side View */}
          <TabsContent value="sideBySide" className="flex-1 min-h-0 px-6 pb-4 mt-3">
            <div className="h-full grid grid-cols-2 gap-4">
              {/* Original */}
              <div className="flex flex-col min-h-0">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-gray-500" />
                  <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Current</span>
                </div>
                <div className="flex-1 overflow-auto rounded-lg border bg-white p-4">
                  <RenderFormattedContent text={originalText} />
                </div>
              </div>
              
              {/* Proposed */}
              <div className="flex flex-col min-h-0">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <span className="text-xs font-medium text-purple-600 uppercase tracking-wide">AI Suggested</span>
                </div>
                <div className="flex-1 overflow-auto rounded-lg border-2 border-purple-200 bg-purple-50/30 p-4">
                  <RenderFormattedContent text={proposedText} />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Unified Diff View */}
          <TabsContent value="diff" className="flex-1 min-h-0 px-6 pb-4 mt-3">
            <div className="h-full overflow-auto rounded-lg border bg-white">
              <div className="divide-y divide-gray-100">
                {diff.map((line, idx) => {
                  if (line.type === 'same') {
                    return (
                      <div key={idx} className="px-4 py-1.5 text-sm text-gray-600 font-mono bg-gray-50/50">
                        <span className="text-gray-400 mr-3 select-none">&nbsp;</span>
                        {line.original || '\u00A0'}
                      </div>
                    );
                  }
                  
                  if (line.type === 'removed') {
                    return (
                      <div key={idx} className="px-4 py-1.5 text-sm font-mono bg-rose-50 text-rose-800">
                        <span className="text-rose-500 mr-3 select-none font-bold">−</span>
                        {line.original || '\u00A0'}
                      </div>
                    );
                  }
                  
                  if (line.type === 'added') {
                    return (
                      <div key={idx} className="px-4 py-1.5 text-sm font-mono bg-emerald-50 text-emerald-800">
                        <span className="text-emerald-500 mr-3 select-none font-bold">+</span>
                        {line.proposed || '\u00A0'}
                      </div>
                    );
                  }
                  
                  // Changed line - show both
                  return (
                    <div key={idx}>
                      <div className="px-4 py-1.5 text-sm font-mono bg-rose-50 text-rose-800">
                        <span className="text-rose-500 mr-3 select-none font-bold">−</span>
                        {line.original || '\u00A0'}
                      </div>
                      <div className="px-4 py-1.5 text-sm font-mono bg-emerald-50 text-emerald-800">
                        <span className="text-emerald-500 mr-3 select-none font-bold">+</span>
                        {line.proposed || '\u00A0'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* Preview New View */}
          <TabsContent value="proposed" className="flex-1 min-h-0 px-6 pb-4 mt-3">
            <div className="h-full overflow-auto rounded-lg border-2 border-purple-200 bg-white p-6">
              <div className="mb-4 pb-4 border-b border-purple-100">
                <div className="flex items-center gap-2 text-purple-700">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-sm font-medium">Preview of AI Suggested Content</span>
                </div>
              </div>
              <RenderFormattedContent text={proposedText} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 border-t bg-white">
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            data-cta-id="cta-compare-keep-original"
            data-action="close_modal"
            onClick={onReject}
          >
            <X className="h-4 w-4 mr-2" />
            Keep Current
          </Button>
          <Button
            variant="default"
            className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            data-cta-id="cta-compare-apply-proposed"
            data-action="apply"
            onClick={onAdopt}
          >
            <Check className="h-4 w-4 mr-2" />
            Apply Changes
          </Button>
        </div>
      </div>
    </div>
  );
};
