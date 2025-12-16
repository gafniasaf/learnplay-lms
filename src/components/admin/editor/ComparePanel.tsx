import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Check, X, FileText, Image, Layers, Sparkles, Equal, ArrowLeft } from 'lucide-react';

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
    <div className="space-y-3">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        
        // Section marker
        const sectionMatch = trimmed.match(/^\[SECTION:(.*?)\]$/);
        if (sectionMatch) {
          return (
            <div key={i} className="flex items-center gap-2 py-2 mt-4 first:mt-0">
              <Layers className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <span className="font-semibold text-blue-900 bg-blue-50 px-3 py-1 rounded-md text-base">
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
            <div key={i} className="flex items-center gap-2 py-2 my-2">
              <Image className="h-5 w-5 text-purple-600 flex-shrink-0" />
              <span className={cn(
                "px-3 py-1 rounded-md",
                isUrl 
                  ? "text-purple-700 bg-purple-50 font-mono text-xs" 
                  : "text-purple-600 bg-purple-50/50 italic text-sm"
              )}>
                {isUrl ? '🖼️ Generated image' : `📝 ${imageMatch[1]}`}
              </span>
            </div>
          );
        }
        
        // Empty line
        if (!trimmed) {
          return <div key={i} className="h-3" />;
        }
        
        // Regular text
        return (
          <p key={i} className="text-base text-gray-700 leading-relaxed">
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

  // No changes state - make it prominent
  if (!hasChanges) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-white flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 -ml-2"
            data-cta-id="cta-compare-back"
            data-action="close_modal"
            onClick={onReject}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h4 className="text-base font-semibold text-gray-900">{label}</h4>
        </div>
        
        {/* No Changes Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-6">
            <Equal className="h-10 w-10 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-3">No Changes Detected</h3>
          <p className="text-base text-muted-foreground max-w-md mb-8">
            The AI suggestion is identical to your current content. No modifications needed.
          </p>
          <Button
            size="lg"
            variant="outline"
            data-cta-id="cta-compare-dismiss"
            data-action="close_modal"
            onClick={onReject}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Editor
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header - Fixed */}
      <div className="px-6 py-4 border-b bg-white flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 -ml-2"
              data-cta-id="cta-compare-back"
              data-action="close_modal"
              onClick={onReject}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-gray-900">{label}</h4>
              <p className="text-sm text-muted-foreground">Review the AI's suggested changes</p>
            </div>
          </div>
        </div>
        
        {/* Change Summary */}
        <div className="flex items-center gap-4 text-sm ml-12">
          <Badge variant="outline" className="gap-1.5 font-normal py-1 px-2.5">
            <span className="text-rose-600 font-mono font-medium">−{diff.filter(d => d.type === 'removed' || d.type === 'changed').length}</span>
            <span className="text-emerald-600 font-mono font-medium">+{diff.filter(d => d.type === 'added' || d.type === 'changed').length}</span>
            <span className="text-muted-foreground">lines</span>
          </Badge>
          {proposedSummary.sections.length > 0 && (
            <span className="text-muted-foreground">
              {proposedSummary.sections.length} section{proposedSummary.sections.length !== 1 ? 's' : ''}
            </span>
          )}
          {proposedSummary.images > 0 && (
            <span className="text-muted-foreground">
              {proposedSummary.images} image{proposedSummary.images !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Body - Scrollable */}
      <div className="flex-1 overflow-hidden bg-gray-50">
        <Tabs defaultValue="preview" className="h-full flex flex-col">
          <div className="px-6 pt-4 pb-2 bg-gray-50 flex-shrink-0">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger
                value="preview"
                data-cta-id="cta-compare-tab-preview"
                data-action="tab"
              >
                Preview New
              </TabsTrigger>
              <TabsTrigger
                value="sideBySide"
                data-cta-id="cta-compare-tab-sidebyside"
                data-action="tab"
              >
                Compare
              </TabsTrigger>
              <TabsTrigger
                value="diff"
                data-cta-id="cta-compare-tab-diff"
                data-action="tab"
              >
                Diff
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Preview New View - Default */}
          <TabsContent value="preview" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full">
              <div className="px-6 py-4">
                <div className="bg-white rounded-xl border-2 border-purple-200 p-6 shadow-sm">
                  <div className="mb-5 pb-4 border-b border-purple-100">
                    <div className="flex items-center gap-2 text-purple-700">
                      <Sparkles className="h-5 w-5" />
                      <span className="font-medium">AI Suggested Content</span>
                    </div>
                  </div>
                  <RenderFormattedContent text={proposedText} />
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Side by Side View */}
          <TabsContent value="sideBySide" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full">
              <div className="px-6 py-4 space-y-4">
                {/* Current */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-600 uppercase tracking-wide">Current</span>
                  </div>
                  <div className="bg-white rounded-xl border p-5">
                    <RenderFormattedContent text={originalText} />
                  </div>
                </div>
                
                {/* Proposed */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-medium text-purple-600 uppercase tracking-wide">AI Suggested</span>
                  </div>
                  <div className="bg-white rounded-xl border-2 border-purple-200 p-5">
                    <RenderFormattedContent text={proposedText} />
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Unified Diff View */}
          <TabsContent value="diff" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full">
              <div className="px-6 py-4">
                <div className="bg-white rounded-xl border overflow-hidden">
                  <div className="divide-y divide-gray-100">
                    {diff.map((line, idx) => {
                      if (line.type === 'same') {
                        return (
                          <div key={idx} className="px-4 py-2 text-sm text-gray-600 font-mono bg-gray-50/50">
                            <span className="text-gray-400 mr-4 select-none inline-block w-4">&nbsp;</span>
                            {line.original || '\u00A0'}
                          </div>
                        );
                      }
                      
                      if (line.type === 'removed') {
                        return (
                          <div key={idx} className="px-4 py-2 text-sm font-mono bg-rose-50 text-rose-800">
                            <span className="text-rose-500 mr-4 select-none font-bold inline-block w-4">−</span>
                            {line.original || '\u00A0'}
                          </div>
                        );
                      }
                      
                      if (line.type === 'added') {
                        return (
                          <div key={idx} className="px-4 py-2 text-sm font-mono bg-emerald-50 text-emerald-800">
                            <span className="text-emerald-500 mr-4 select-none font-bold inline-block w-4">+</span>
                            {line.proposed || '\u00A0'}
                          </div>
                        );
                      }
                      
                      // Changed line - show both
                      return (
                        <div key={idx}>
                          <div className="px-4 py-2 text-sm font-mono bg-rose-50 text-rose-800">
                            <span className="text-rose-500 mr-4 select-none font-bold inline-block w-4">−</span>
                            {line.original || '\u00A0'}
                          </div>
                          <div className="px-4 py-2 text-sm font-mono bg-emerald-50 text-emerald-800">
                            <span className="text-emerald-500 mr-4 select-none font-bold inline-block w-4">+</span>
                            {line.proposed || '\u00A0'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* Actions - Fixed at bottom */}
      <div className="px-6 py-4 border-t bg-white flex-shrink-0">
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            data-cta-id="cta-compare-keep-original"
            data-action="close_modal"
            onClick={onReject}
          >
            <X className="h-4 w-4 mr-2" />
            Keep Current
          </Button>
          <Button
            size="lg"
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
