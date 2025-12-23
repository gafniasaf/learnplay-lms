import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMCP } from '@/hooks/useMCP';
import { generateMedia } from '@/lib/api/aiRewrites';
import { toast } from 'sonner';
import { Sparkles, Upload, Link as LinkIcon, Eye, Code } from 'lucide-react';
import { sanitizeHtml } from '@/lib/utils/sanitizeHtml';

interface StemTabProps {
  item: any;
  onChange: (updatedItem: any) => void;
  onAIRewrite?: () => void;
  onOpenAIChat?: () => void;
  onAddMedia?: () => void;
  onFromURL?: (url: string, type: 'image' | 'audio' | 'video') => void;
  onRemoveMedia?: (mediaId: string) => void;
  onReplaceMedia?: (mediaId: string) => void;
  courseId?: string;
  course?: any;
}

export const StemTab = ({ item, onChange, onAIRewrite, onOpenAIChat, onAddMedia, onFromURL, onRemoveMedia, onReplaceMedia, courseId, course }: StemTabProps) => {
  const mcp = useMCP();

  // Handle both schema formats: item.stem.text (new) and item.text (legacy)
  const initialText = item?.stem?.text || (item as any)?.text || '';
  const [stemText, setStemText] = useState(initialText);
  const [showPreview, setShowPreview] = useState(false);
  const media = item?.stem?.media || (item as any)?.stimulus?.media || [];
  const [_aiImgLoading, setAiImgLoading] = useState(false);

  // Sync state when item changes (navigation between items)
  useEffect(() => {
    const newText = item?.stem?.text || (item as any)?.text || '';
    setStemText(newText);
  }, [item]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setStemText(newText);
    
    // Update in the format the item uses
    if (item.stem) {
      onChange({
        ...item,
        stem: {
          ...item.stem,
          text: newText,
        },
      });
    } else {
      // Legacy format: item.text
      onChange({
        ...item,
        text: newText,
      });
    }
  };

  const wordCount = stemText.split(/\s+/).filter(Boolean).length;
  const _readingTimeSeconds = Math.ceil((wordCount / 200) * 60);
  
  const sanitizedHtml = sanitizeHtml(stemText);

  return (
    <div className="space-y-6">
      {/* Stem Text Section */}
      <div className="bg-background border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-muted border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Question Text</h3>
            <p className="text-xs text-foreground/70 mt-0.5">Write the question or instruction in HTML format</p>
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
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onOpenAIChat ?? onAIRewrite} 
              className="shadow-sm bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 hover:from-purple-100 hover:to-pink-100"
              data-cta-id="cta-courseeditor-stem-ai-rewrite"
              data-action="action"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
              <span className="text-purple-700">AI Rewrite</span>
            </Button>
          </div>
        </div>
        
        <div className="p-6">
          {!showPreview ? (
            <Textarea
              value={stemText}
              onChange={handleTextChange}
              className="min-h-[140px] font-mono text-sm leading-relaxed resize-y"
              placeholder="<p>Enter the question or instruction...</p>"
            />
          ) : (
            <div className="border-2 border-dashed border-border rounded-lg p-6 min-h-[140px] bg-muted/50">
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              />
            </div>
          )}
          
          <div className="flex items-center gap-2 mt-3 text-xs text-foreground/70">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>HTML is automatically sanitized for security. Only safe tags and attributes are allowed.</span>
          </div>
        </div>
      </div>

      {/* Media Section */}
      <div className="bg-background border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-muted border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Media Assets</h3>
            <p className="text-xs text-foreground/70 mt-0.5">Add images, audio, or video to enrich the question</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onAddMedia} className="shadow-sm">
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Upload
            </Button>
            <Button variant="outline" size="sm" onClick={async () => {
              if (!courseId) {
                toast.error('Missing courseId');
                return;
              }
              const stem = item?.stem?.text || (item as any)?.text || '';
              const _gradeBand = (course as any)?.gradeBand || '';
              const subj = (course as any)?.subject || course?.title || 'General';
              const _studyObjectives = ((course as any)?.studyTexts || [])
                .flatMap((st: any) => Array.isArray(st?.learningObjectives) ? st.learningObjectives : [])
                .slice(0, 6)
                .join(', ');
              // Build context-aware prompt that avoids OpenAI safety filters
              const stemPlain = stem.replace(/<[^>]*>/g, '').replace(/\[blank\]/gi, '___').slice(0, 160);
              const allOptions = Array.isArray(item?.options) ? item.options.slice(0, 4).map((o: any) => typeof o === 'string' ? o : o?.text || '').filter(Boolean) : [];
              const optionsContext = allOptions.length > 0 ? `Answer choices include: ${allOptions.join(', ')}.` : '';
              
              const prompt = [
                `Simple learning visual for ${subj}.`,
                `Question context: ${stemPlain}`,
                optionsContext,
                `Create a clean photo or realistic illustration that helps students understand this concept.`,
                `IMPORTANT: Absolutely no text, letters, words, labels, numbers, or written language anywhere in the image.`,
                `No diagrams, charts, or infographics. Just a clean visual representation.`,
                `Original artwork only - no copyrighted characters or brands.`,
                `Colorful, friendly, child-appropriate educational style.`,
              ].filter(Boolean).join(' ');

              try {
                setAiImgLoading(true);
                toast.info('Generating image…');
                const res = await generateMedia({ prompt, kind: 'image', options: { aspectRatio: '16:9', size: '1024x1024', quality: 'standard' } });
                // Use returned public URL directly for instant preview
                const newMediaItem = { id: crypto.randomUUID(), type: 'image', url: res.url, alt: res.alt || 'Course image' } as any;
                const current = item;
                const existing = (current as any).stem?.media || (current as any).stimulus?.media || [];
                const updated = Array.isArray(existing) ? [...existing, newMediaItem] : [newMediaItem];
                const updatedItem = (current as any).stem
                  ? { ...current, stem: { ...(current as any).stem, media: updated } }
                  : { ...current, stimulus: { ...(current as any).stimulus, media: updated } };
                onChange(updatedItem);
                toast.success('AI image added to stem');
              } catch (e: any) {
                console.error(e);
                toast.error(e?.message || 'AI image generation failed');
              } finally {
                setAiImgLoading(false);
              }
            }} className="shadow-sm bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 hover:from-purple-100 hover:to-pink-100">
              <Sparkles className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
              <span className="text-purple-700">AI Image</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              const url = prompt('Enter direct media file URL:\n\nExamples:\n• Image: https://example.com/photo.jpg\n• Video: https://example.com/video.mp4\n• Audio: https://example.com/sound.mp3');
              if (url) {
                // Validate that it's a direct media file URL
                const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(url);
                const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(url);
                const isAudio = /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(url);
                
                if (!isImage && !isVideo && !isAudio) {
                  alert('❌ Invalid Media URL\n\nPlease enter a direct link to a media file, not a website.\n\nValid examples:\n✅ https://example.com/photo.jpg\n✅ https://example.com/video.mp4\n✅ https://example.com/audio.mp3\n\n❌ https://example.com (website URLs don\'t work)');
                  return;
                }
                
                const type = isVideo ? 'video' : isAudio ? 'audio' : 'image';
                onFromURL?.(url, type);
              }
            }} className="shadow-sm">
              <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
              From URL
            </Button>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {media.map((mediaItem: any) => (
              <div
                key={mediaItem.id}
                className="group bg-background border-2 border-border rounded-xl overflow-hidden hover:border-primary hover:shadow-lg transition-all duration-200"
              >
                <div className="aspect-video bg-muted flex items-center justify-center relative overflow-hidden">
                  {mediaItem.type === 'image' && mediaItem.url && (
                    <img
                      src={mediaItem.url}
                      alt={mediaItem.alt || 'Media'}
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  )}
                  {mediaItem.type === 'audio' && (
                    <div className="flex flex-col items-center">
                      <div className="text-4xl mb-2">🔊</div>
                      <div className="text-xs text-foreground/70 font-medium">Audio File</div>
                    </div>
                  )}
                  {mediaItem.type === 'video' && (
                    <div className="flex flex-col items-center">
                      <div className="text-4xl mb-2">🎥</div>
                      <div className="text-xs text-foreground/70 font-medium">Video File</div>
                    </div>
                  )}
                  <div className="absolute top-2 right-2 bg-foreground/70 text-background text-xs px-2 py-0.5 rounded-full">
                    {mediaItem.type}
                  </div>
                </div>
                <div className="p-3 bg-background border-t border-border">
                  <div className="text-xs text-foreground/70 font-medium mb-2 truncate" title={mediaItem.alt || mediaItem.url?.split('/').pop() || 'Media'}>
                    {mediaItem.alt || mediaItem.url?.split('/').pop() || 'Media'}
                  </div>
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex-1 text-xs h-8 hover:bg-blue-50 hover:text-blue-700"
                      onClick={() => onReplaceMedia?.(mediaItem.id)}
                    >
                      🔄
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex-1 text-xs h-8 hover:bg-green-50 hover:text-green-700"
                      onClick={() => {
                        const nextAlt = prompt('Alt text (image description):', mediaItem.alt || '');
                        if (nextAlt === null) return;
                        // Update item media alt in the format the item uses
                        const current = item;
                        const updateAlt = (arr: any[]) => arr.map(m => m.id === mediaItem.id ? { ...m, alt: nextAlt } : m);
                        if ((current as any).stem?.media) {
                          onChange({
                            ...current,
                            stem: { ...(current as any).stem, media: updateAlt((current as any).stem.media) }
                          });
                        } else if ((current as any).stimulus?.media) {
                          onChange({
                            ...current,
                            stimulus: { ...(current as any).stimulus, media: updateAlt((current as any).stimulus.media) }
                          });
                        }
                      }}
                    >
                      ✏️
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex-1 text-xs h-8 hover:bg-purple-50 hover:text-purple-700"
                      onClick={async () => {
                        try {
                          const subj = (course as any)?.subject || course?.title || 'General';
                          const gradeBand = (course as any)?.gradeBand || '';
                          const stemPlain = String(item?.stem?.text || (item as any)?.text || '').replace(/<[^>]*>/g,'');
                          const guidance = 'Generate a single concise descriptive alt text (<= 100 chars) for the image that best supports the question for the audience. No HTML.';
                          const res = await mcp.rewriteText({
                            segmentType: 'stem',
                            currentText: stemPlain,
                            context: {
                              subject: subj,
                              difficulty: 'intermediate',
                              course: { title: course?.title, subject: (course as any)?.subject, gradeBand },
                              guidance,
                            },
                            candidateCount: 1,
                          });
                          const html = res.candidates?.[0]?.text || '';
                          const generatedAlt = html.replace(/<[^>]*>/g,'').trim().slice(0, 120);
                          if (!generatedAlt) {
                            toast.error('AI alt generation failed');
                            return;
                          }
                          const current = item;
                          const updateAlt = (arr: any[]) => arr.map(m => m.id === mediaItem.id ? { ...m, alt: generatedAlt } : m);
                          if ((current as any).stem?.media) {
                            onChange({ ...current, stem: { ...(current as any).stem, media: updateAlt((current as any).stem.media) } });
                          } else if ((current as any).stimulus?.media) {
                            onChange({ ...current, stimulus: { ...(current as any).stimulus, media: updateAlt((current as any).stimulus.media) } });
                          }
                          toast.success('Alt updated');
                        } catch (e:any) {
                          console.error(e);
                          toast.error(e?.message || 'AI alt failed');
                        }
                      }}
                    >
                      🤖
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex-1 text-xs h-8 hover:bg-red-50 hover:text-red-700"
                      onClick={() => onRemoveMedia?.(mediaItem.id)}
                    >
                      🗑️
                    </Button>
                  </div>
                </div>
              </div>
            ))}

          </div>
        </div>
      </div>
    </div>
  );
};

