import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Eye, Code } from 'lucide-react';
import { resolveItemContent, getDefaultVariantLevel } from '@/lib/utils/variantResolution';
import type { VariantLevel } from '@/lib/types/courseVNext';
import { sanitizeHtml } from '@/lib/utils/sanitizeHtml';

interface ReferenceTabProps {
  item: any;
  onChange: (updatedItem: any) => void;
  onAIRewrite?: () => void;
  course?: any; // Optional: for variant resolution
  userLevel?: VariantLevel; // Optional: current difficulty level
}

export const ReferenceTab = ({ item, onChange, onAIRewrite, course, userLevel }: ReferenceTabProps) => {
  // Use variant resolution to get the explanation
  const defaultLevel = course ? getDefaultVariantLevel(course) : 'intermediate';
  const currentLevel = userLevel || defaultLevel;
  
  // Try to resolve using variant system first
  let initialHtml = '';
  if (item?.explanation?.variants) {
    // New vNext format: resolve based on variant level
    const resolved = resolveItemContent(item, currentLevel, defaultLevel);
    initialHtml = resolved.explanation || '';
  } else {
    // Fallback to legacy formats
    initialHtml = item?.reference?.html || item?.referenceHtml || item?.explain || '';
  }
  
  const [html, setHtml] = useState(initialHtml);
  const [showPreview, setShowPreview] = useState(true);

  // Sync state when item changes
  useEffect(() => {
    let newHtml = '';
    if (item?.explanation?.variants) {
      const resolved = resolveItemContent(item, currentLevel, defaultLevel);
      newHtml = resolved.explanation || '';
    } else {
      newHtml = item?.reference?.html || item?.referenceHtml || item?.explain || '';
    }
    setHtml(newHtml);
  }, [item, currentLevel, defaultLevel]);

  const handleHtmlChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newHtml = e.target.value;
    setHtml(newHtml);
    
    // Update in the format the item uses
    if (item.explanation?.variants) {
      // New vNext format: update the variant for current level
      onChange({
        ...item,
        explanation: {
          ...item.explanation,
          variants: {
            ...item.explanation.variants,
            [currentLevel]: newHtml,
          },
        },
      });
    } else if (item.reference) {
      onChange({
        ...item,
        reference: {
          ...item.reference,
          html: newHtml,
        },
      });
    } else if (item.referenceHtml !== undefined) {
      onChange({
        ...item,
        referenceHtml: newHtml,
      });
    } else {
      // Legacy: update 'explain' field (create it if it doesn't exist)
      onChange({
        ...item,
        explain: newHtml,
      });
    }
  };

  const sanitizedHtml = sanitizeHtml(html);

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Explanation & Reference</h3>
            <p className="text-xs text-gray-500 mt-0.5">Provide detailed explanation and reference material in HTML format</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              className="shadow-sm"
            >
              {showPreview ? <Code className="h-3.5 w-3.5 mr-1.5" /> : <Eye className="h-3.5 w-3.5 mr-1.5" />}
              {showPreview ? 'Edit HTML' : 'Preview'}
            </Button>
            <Button variant="outline" size="sm" onClick={onAIRewrite} className="shadow-sm bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 hover:from-purple-100 hover:to-pink-100">
              <Sparkles className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
              <span className="text-purple-700">AI Rewrite</span>
            </Button>
          </div>
        </div>

        {/* Editor / Preview Toggle */}
        <div className="p-6">
          {!showPreview ? (
            <Textarea
              value={html}
              onChange={handleHtmlChange}
              className="min-h-[320px] font-mono text-sm resize-y border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="<h3>Explanation Title</h3>\n<p>Provide a clear, detailed explanation here...</p>\n<ul>\n  <li>Key point 1</li>\n  <li>Key point 2</li>\n</ul>"
            />
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 min-h-[320px] bg-gradient-to-br from-gray-50 to-white">
              {html ? (
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
                  <svg className="h-12 w-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm font-medium">No explanation yet</p>
                  <p className="text-xs mt-1">Click "Edit HTML" to add content</p>
                </div>
              )}
            </div>
          )}

          {/* Safety notice */}
          <div className="flex items-center gap-2 mt-4 text-xs text-gray-500">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>HTML is automatically sanitized for security. Only safe tags and attributes are allowed.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
