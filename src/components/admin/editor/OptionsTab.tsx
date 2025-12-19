import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Plus, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { rewriteText } from '@/lib/api/aiRewrites';
import { toast } from 'sonner';
import { logger } from '@/lib/logging';
import type { OptionMedia } from '@/lib/media/types';
import { generateOptionImagePrompted, generateAltForOption } from '@/lib/editor/optionsHelpers';
import type { EditorItem, EditorOption, CourseMeta } from '@/lib/editor/types';
import { sanitizeHtml } from '@/lib/utils/sanitizeHtml';

interface OptionsTabProps {
  item: EditorItem;
  onChange: (updatedItem: EditorItem) => void;
  onAIRewrite?: (optionIndex: number) => void;
  onOpenAIChatOption?: (optionIndex: number) => void;
  onAddMedia?: (optionIndex: number) => void;
  onRemoveOptionMedia?: (optionIndex: number) => void;
  courseId?: string;
  course?: CourseMeta;
}

export const OptionsTab = ({ item, onChange, onAIRewrite, onOpenAIChatOption: _onOpenAIChatOption, onAddMedia: _onAddMedia, onRemoveOptionMedia: _onRemoveOptionMedia, courseId, course }: OptionsTabProps) => {
  // Handle both schema formats
  const options: EditorOption[] = item?.options || [];
  const isNumericMode = item?.mode === 'numeric';
  const [showPreview, setShowPreview] = useState<Record<number, boolean>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiImageLoading, setAiImageLoading] = useState<Record<number, boolean>>({});
  const currentCorrectIndex: number = typeof item?.correctIndex === 'number' ? item.correctIndex : -1;

  // Debug log gated by logger; keep noise out of prod consoles
  logger.debug('[OptionsTab] Item mode:', item?.mode, 'isNumericMode:', isNumericMode, 'options:', options);
  
  const togglePreview = (index: number) => {
    setShowPreview(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const setCorrectIndex = (index: number) => {
    onChange({
      ...item,
      correctIndex: index,
    });
  };

  // Native drag-and-drop for options (declare hooks before any conditional returns)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // For numeric items, show answer editor
  if (isNumericMode) {
    const currentAnswer = item?.answer ?? '';

    const handleAnswerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // Allow empty or valid numbers (including decimals and negatives)
      if (value === '' || !isNaN(Number(value))) {
        onChange({
          ...item,
          answer: value === '' ? '' : Number(value),
        });
      }
    };

    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-300 rounded-xl p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center text-xl font-bold flex-shrink-0">
              #
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900 mb-1">
                Numeric Mode
              </p>
              <p className="text-xs text-blue-700">
                Students will type a number instead of selecting from multiple choice options.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Correct Answer</h3>
            <p className="text-xs text-gray-500 mt-0.5">Enter the numeric value that students must provide</p>
          </div>
          
          <div className="p-6">
            <Input
              type="number"
              value={currentAnswer}
              onChange={handleAnswerChange}
              placeholder="Enter the correct numeric answer..."
              className="text-lg font-semibold h-12 border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              step="any"
            />
            
            <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Accepts whole numbers, decimals, and negative numbers.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    
    onChange({
      ...item,
      options: newOptions,
    });
  };

  const handleAddOption = () => {
    const newOptions = [...options, ''];
    onChange({
      ...item,
      options: newOptions,
      correctIndex: typeof item?.correctIndex === 'number' ? item.correctIndex : 0,
    });
  };


  // Reorder helpers
  const swap = <T,>(arr: T[], i: number, j: number) => {
    const copy = [...arr];
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
    return copy;
  };

  const moveOption = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= options.length) return;
    const newOptions = swap(options, index, j);
    let nextCorrect = currentCorrectIndex;
    if (currentCorrectIndex === index) nextCorrect = j;
    else if (currentCorrectIndex === j) nextCorrect = index;
    onChange({ ...item, options: newOptions, correctIndex: nextCorrect });
  };

  // Native drag-and-drop for options
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, toIndex: number) => {
    e.preventDefault();
    const fromIndexStr = e.dataTransfer.getData('text/plain');
    const fromIndex = Number(fromIndexStr);
    setDragOverIndex(null);
    if (Number.isNaN(fromIndex) || fromIndex === toIndex) return;
    const newOptions = [...options];
    const [moved] = newOptions.splice(fromIndex, 1);
    newOptions.splice(toIndex, 0, moved);
    let nextCorrect = currentCorrectIndex;
    if (currentCorrectIndex === fromIndex) nextCorrect = toIndex;
    else if (fromIndex < currentCorrectIndex && toIndex >= currentCorrectIndex) nextCorrect = currentCorrectIndex - 1;
    else if (fromIndex > currentCorrectIndex && toIndex <= currentCorrectIndex) nextCorrect = currentCorrectIndex + 1;
    onChange({ ...item, options: newOptions, correctIndex: nextCorrect });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-1">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Answer Options</h3>
          <p className="text-xs text-gray-500 mt-0.5">Drag to reorder • Click radio to mark correct answer</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={aiLoading} className="shadow-sm bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 hover:from-purple-100 hover:to-pink-100" onClick={async () => {
            if (options.length === 0) return;
            try {
              setAiLoading(true);
              toast.info('Rewriting all options...');
              const rewrites: string[] = [];
              for (let i = 0; i < options.length; i++) {
                const opt = options[i];
                const textValue = typeof opt === 'string' ? opt : (opt?.text ?? '');
                const res = await rewriteText({ segmentType: 'option', currentText: textValue, context: { }, candidateCount: 1 });
                rewrites.push(res.candidates?.[0]?.text ?? textValue);
              }
              const preview = rewrites.map((t, idx) => `${String.fromCharCode(65+idx)}. ${t}`).join('\n');
              const ok = confirm(`AI suggestions:\n\n${preview}\n\nApply all?`);
              if (ok) {
                const newOptions = options.map((opt: any, idx: number) => (typeof opt === 'string' ? rewrites[idx] : { ...opt, text: rewrites[idx] }));
                onChange({ ...item, options: newOptions });
                toast.success('Options updated');
              }
            } catch (e) {
              console.error('AI improve all failed', e);
              toast.error('AI improve all failed');
            } finally {
              setAiLoading(false);
            }
          }}
          data-cta-id="cta-courseeditor-option-ai-improve-all"
          data-action="action"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
            <span className="text-purple-700">{aiLoading ? 'Improving...' : 'AI Improve All'}</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleAddOption} 
            className="shadow-sm"
            data-cta-id="cta-courseeditor-option-add"
            data-action="action"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Option
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {options.map((option: EditorOption, index: number) => {
          const textValue = typeof option === 'string' ? option : (option?.text ?? '');
          const sanitizedHtml = sanitizeHtml(textValue);
          const isCorrect = currentCorrectIndex === index;
          
          return (
            <div
              key={index}
              className={`
                group bg-white border-2 rounded-xl overflow-hidden transition-all duration-200
                ${dragOverIndex === index ? 'border-blue-400 shadow-lg scale-[1.02]' : isCorrect ? 'border-green-400 shadow-md' : 'border-gray-200 hover:border-gray-300 hover:shadow-md'}
              `}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDragEnter={() => setDragOverIndex(index)}
              onDragLeave={() => setDragOverIndex(null)}
              onDrop={(e) => handleDrop(e, index)}
            >
              <div className="flex items-start gap-4 p-4">
                <GripVertical className="h-5 w-5 text-gray-400 group-hover:text-gray-600 cursor-grab mt-3 transition-colors" />
                
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center font-bold text-base flex-shrink-0 transition-all
                  ${isCorrect ? 'bg-green-500 text-white shadow-lg' : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'}
                `}>
                  {String.fromCharCode(65 + index)}
                </div>

                <div className="ml-auto flex items-center gap-2">
                  {/* Move up/down */}
                  <Button variant="ghost" size="icon" onClick={() => moveOption(index, -1)} disabled={index===0} title="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => moveOption(index, 1)} disabled={index===options.length-1} title="Move down">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  {/* Mark correct */}
                  <input type="radio" className="mt-3" checked={isCorrect} onChange={() => setCorrectIndex(index)} title="Mark correct" />
                </div>
              </div>

              {/* Option editor */}
              <div className="px-4 pb-4">
                {!showPreview[index] ? (
                  <Textarea
                    value={textValue}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    className="min-h-[80px] font-mono text-xs"
                    placeholder={`Option ${String.fromCharCode(65+index)}`}
                  />
                ) : (
                  <div className="border rounded-lg p-3 bg-gray-50">
                    <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
                  </div>
                )}

                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePreview(index);
                    }}
                    data-cta-id={`cta-courseeditor-option-${index}-preview-toggle`}
                    data-action="action"
                  >
                    {showPreview[index] ? 'Edit HTML' : 'Preview'}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={(e) => {
                      e.stopPropagation();
                      onAIRewrite?.(index);
                    }} 
                    className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 hover:from-purple-100 hover:to-pink-100"
                    data-cta-id={`cta-courseeditor-option-${index}-ai-rewrite`}
                    data-action="action"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
                    AI Rewrite
                  </Button>
                  {/* Media layout toggle: Thumbnail vs Full-bleed */}
                  <Button
                    variant="outline"
                    size="sm"
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const existingOptionMedia = ((item as any).optionMedia || []) as OptionMedia[];
                      const m = existingOptionMedia[index];
                      // If missing, create a default image media to satisfy editor flow
                      const baseMedia = m && (m.type === 'image' || m.type === 'video') ? m : ({ type: 'image', url: '' } as any);
                      const current = (baseMedia as any).mediaLayout ?? 'full';
                      const next = current === 'full' ? 'thumbnail' : 'full';
                      const updatedOptionMedia = [...existingOptionMedia];
                      updatedOptionMedia[index] = { ...(baseMedia as any), mediaLayout: next };
                      const updatedItem = { options, correctIndex: currentCorrectIndex, optionMedia: updatedOptionMedia } as any;
                      onChange(updatedItem);
                      toast.success(`Media layout: ${next}`);
                    }}
                    title="Toggle media layout: thumbnail/full"
                    data-cta-id={`cta-courseeditor-option-${index}-layout-toggle`}
                    data-action="action"
                  >
                    Layout: <span className="ml-1 font-mono text-xs">{(item.optionMedia?.[index] && (item.optionMedia?.[index]?.type === 'image' || item.optionMedia?.[index]?.type === 'video') ? item.optionMedia?.[index]?.mediaLayout : undefined) ?? 'full'}</span>
                  </Button>
                  {/* Fit mode toggle */}
                  <Button
                    variant="outline"
                    size="sm"
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const existingOptionMedia = (item.optionMedia || []) as OptionMedia[];
                      const m = existingOptionMedia[index];
                      // If missing, create a default image media to satisfy editor flow
                      const baseMedia = m && (m.type === 'image' || m.type === 'video') ? m : ({ type: 'image', url: '' } as any);
                      const next = (baseMedia as any).fitMode === 'contain' ? 'cover' : 'contain';
                      const updatedOptionMedia = [...existingOptionMedia];
                      updatedOptionMedia[index] = { ...(baseMedia as any), fitMode: next };
                      const updatedItem = { options, correctIndex: currentCorrectIndex, optionMedia: updatedOptionMedia } as any;
                      onChange(updatedItem);
                      toast.success(`Fit mode: ${next}`);
                    }}
                    title="Toggle fit mode: cover/contain"
                    data-cta-id={`cta-courseeditor-option-${index}-fit-toggle`}
                    data-action="action"
                  >
                    Fit: <span className="ml-1 font-mono text-xs">{(item.optionMedia?.[index] && (item.optionMedia?.[index]?.type === 'image' || item.optionMedia?.[index]?.type === 'video') ? item.optionMedia?.[index]?.fitMode : undefined) || 'auto'}</span>
                  </Button>
                  {/* AI Image for option */}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={aiImageLoading[index]}
                    onClick={async (e) => {
                      e.stopPropagation(); // Prevent drag handlers from interfering
                      if (!courseId) {
                        toast.error('Missing courseId');
                        return;
                      }
                      try {
                        setAiImageLoading(prev => ({ ...prev, [index]: true }));
                        toast.info(`Generating image for option ${String.fromCharCode(65+index)}…`);
                        const res = await generateOptionImagePrompted({
                          course,
                          item,
                          optionText: textValue,
                          isCorrect: item?.correctIndex === index,
                        });
                        const publicUrl = res.url;
                        const existingOptionMedia = (item.optionMedia || []) as OptionMedia[];
                        const updatedOptionMedia = [...existingOptionMedia];
                        // Default to full-bleed layout with cover fit for cinematic AI images
                        updatedOptionMedia[index] = { 
                          type: 'image', 
                          url: publicUrl, 
                          alt: res.alt || `Option ${String.fromCharCode(65+index)} image`, 
                          width: res.width, 
                          height: res.height,
                          mediaLayout: 'full',
                          fitMode: 'cover'
                        } as any;
                        const updatedItem = { ...item, optionMedia: updatedOptionMedia };
                        onChange(updatedItem);
                        toast.success('AI image attached to option');
                      } catch (e: unknown) {
                        console.error(e);
                        const msg = e instanceof Error ? e.message : 'AI image generation failed';
                        toast.error(msg);
                      } finally {
                        setAiImageLoading(prev => ({ ...prev, [index]: false }));
                      }
                    }}
                    className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 hover:from-purple-100 hover:to-pink-100"
                    data-cta-id={`cta-courseeditor-option-${index}-ai-image`}
                    data-action="action"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
                    {aiImageLoading[index] ? 'Generating…' : 'AI Image'}
                  </Button>
                  {/* AI Alt for option image */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const optMedia = item.optionMedia?.[index];
                        if (!optMedia || optMedia?.type !== 'image') {
                          toast.error('No image attached to this option');
                          return;
                        }
                        const generatedAlt = await generateAltForOption({ course, item, optionText: String(textValue) });
                        if (!generatedAlt) {
                          toast.error('AI alt generation failed');
                          return;
                        }
                        const existingOptionMedia = (item.optionMedia || []) as OptionMedia[];
                        const updatedOptionMedia = [...existingOptionMedia];
                        const current = updatedOptionMedia[index];
                        if (current && current.type === 'image') {
                          updatedOptionMedia[index] = { ...current, alt: generatedAlt };
                        } else {
                          // Should not happen due to earlier guard; keep existing value unchanged.\r
                        }
                        onChange({ ...item, optionMedia: updatedOptionMedia });
                        toast.success('Alt updated');
                      } catch (e: unknown) {
                        console.error(e);
                        const msg = e instanceof Error ? e.message : 'AI alt failed';
                        toast.error(msg);
                      }
                    }}
                    data-cta-id={`cta-courseeditor-option-${index}-ai-alt`}
                    data-action="action"
                  >
                    🤖 Alt
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

