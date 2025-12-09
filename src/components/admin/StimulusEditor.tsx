import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMCP } from "@/hooks/useMCP";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ImageIcon, Music, Video, Link as LinkIcon, Info, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface StimulusEditorProps {
  courseId: string;
  currentStimulus?: 
    | { type: 'image'; url: string; alt?: string; placement?: 'block' | 'inline' }
    | { type: 'audio'; url: string; transcriptUrl?: string; placement?: 'block' | 'inline' }
    | { type: 'video'; url: string; captionsUrl?: string; placement?: 'block' | 'inline' };
  itemMode?: 'options' | 'numeric';
  optionLabels?: string[];
  onAttach: (stimulus: any, target: { type: 'stem'; placement: 'block' | 'inline' } | { type: 'option'; index: number }) => void;
  onRemove: () => void;
  onInsertMediaToken?: () => void;
}

export const StimulusEditor = ({ 
  courseId, 
  currentStimulus, 
  itemMode = 'options',
  optionLabels = ['A', 'B', 'C', 'D'],
  onAttach, 
  onRemove,
  onInsertMediaToken 
}: StimulusEditorProps) => {
  const mcp = useMCP();
  const [activeTab, setActiveTab] = useState<'image' | 'audio' | 'video'>('image');
  const [uploading, setUploading] = useState(false);
  const [attachTarget, setAttachTarget] = useState<string>('stem-block');

  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioTranscript, setAudioTranscript] = useState('');
  const [audioPrompt, setAudioPrompt] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoCaptions, setVideoCaptions] = useState('');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleFileUpload = async (file: File, type: 'image' | 'audio' | 'video') => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const uuid = crypto.randomUUID();
      const folder = type === 'image' ? 'images' : type === 'audio' ? 'audio' : 'video';
      const storagePath = `${courseId}/assets/${folder}/${uuid}.${ext}`;

      // Upload via edge function (IgniteZero compliant)
      const result = await mcp.uploadMediaFile(file, storagePath);

      if (!result.ok) throw new Error('Upload failed');

      if (type === 'image') setImageUrl(result.url);
      else if (type === 'audio') setAudioUrl(result.url);
      else if (type === 'video') setVideoUrl(result.url);

      toast.success(`Uploaded successfully`);
    } catch {
      toast.error('Failed to upload');
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateWithAI = async (itemId: number) => {
    const prompt = activeTab === 'image' ? imagePrompt : 
                   activeTab === 'audio' ? audioPrompt : 
                   videoPrompt;
    
    if (!prompt.trim()) {
      toast.error('Please enter a prompt for AI generation');
      return;
    }

    setGenerating(true);
    try {
      // Generate idempotency key
      const idempotencyKey = `media-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      
      // Submit job to ai_media_jobs table
      const { data: job, error: insertError } = await (supabase as any)
        .from('ai_media_jobs')
        .insert({
          course_id: courseId,
          item_id: itemId,
          media_type: activeTab,
          prompt: prompt,
          provider: activeTab === 'video' ? 'replicate' : 'openai',
          idempotency_key: idempotencyKey,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast.success('AI generation job submitted. Polling for completion...');

      // Poll for job completion (max 5 minutes)
      const maxPolls = 60; // 5 min / 5s
      let polls = 0;

      while (polls < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5s interval

        const { data: updatedJob, error: pollError } = await (supabase as any)
          .from('ai_media_jobs')
          .select('*')
          .eq('id', job.id)
          .single();

        if (pollError) throw pollError;

        if (updatedJob.status === 'done') {
          // Set URL in editor
          if (activeTab === 'image') {
            setImageUrl(updatedJob.result_url);
            if (updatedJob.metadata?.revised_prompt) {
              setImageAlt(updatedJob.metadata.revised_prompt);
            }
          } else if (activeTab === 'audio') {
            setAudioUrl(updatedJob.result_url);
            if (updatedJob.metadata?.transcriptUrl) {
              setAudioTranscript(updatedJob.metadata.transcriptUrl);
            }
          } else if (activeTab === 'video') {
            setVideoUrl(updatedJob.result_url);
            if (updatedJob.metadata?.captionsUrl) {
              setVideoCaptions(updatedJob.metadata.captionsUrl);
            }
          }

          toast.success(`AI ${activeTab} generated successfully!`);
          return;
        }

        if (updatedJob.status === 'failed' || updatedJob.status === 'dead_letter') {
          throw new Error(updatedJob.error || 'Generation failed');
        }

        polls++;
      }

      throw new Error('AI generation timed out after 5 minutes');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`AI generation failed: ${errorMsg}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleAttach = () => {
    let stimulus: any = null;
    
    if (activeTab === 'image' && imageUrl) {
      stimulus = { type: 'image', url: imageUrl, alt: imageAlt || undefined };
    } else if (activeTab === 'audio' && audioUrl) {
      stimulus = { type: 'audio', url: audioUrl, transcriptUrl: audioTranscript || undefined };
    } else if (activeTab === 'video' && videoUrl) {
      stimulus = { type: 'video', url: videoUrl, captionsUrl: videoCaptions || undefined };
    }

    if (stimulus) {
      if (attachTarget.startsWith('stem-')) {
        const placement = attachTarget === 'stem-block' ? 'block' : 'inline';
        onAttach({ ...stimulus, placement }, { type: 'stem', placement });
      } else if (attachTarget.startsWith('option-')) {
        const index = parseInt(attachTarget.split('-')[1]);
        onAttach(stimulus, { type: 'option', index });
      }
    }
  };

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <div className="space-y-3">
        <Label>Attach to</Label>
        <RadioGroup value={attachTarget} onValueChange={setAttachTarget}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="stem-block" id="stem-block" />
            <Label htmlFor="stem-block" className="font-normal cursor-pointer">Stem (block above text)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="stem-inline" id="stem-inline" />
            <Label htmlFor="stem-inline" className="font-normal cursor-pointer">Stem (inline at [media])</Label>
          </div>
          {itemMode === 'options' && optionLabels.map((label, idx) => (
            <div key={idx} className="flex items-center space-x-2">
              <RadioGroupItem value={`option-${idx}`} id={`option-${idx}`} />
              <Label htmlFor={`option-${idx}`} className="font-normal cursor-pointer">Option {label}</Label>
            </div>
          ))}
        </RadioGroup>

        {attachTarget === 'stem-inline' && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Ensure your text contains [media] where you want the media to appear.
              {onInsertMediaToken && (
                <Button variant="link" size="sm" className="p-0 h-auto ml-1" onClick={onInsertMediaToken}>
                  Insert [media] token
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Separator />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="image"><ImageIcon className="h-4 w-4 mr-2" />Image</TabsTrigger>
          <TabsTrigger value="audio"><Music className="h-4 w-4 mr-2" />Audio</TabsTrigger>
          <TabsTrigger value="video"><Video className="h-4 w-4 mr-2" />Video</TabsTrigger>
        </TabsList>

        <TabsContent value="image" className="space-y-4">
          {/* AI Generation Section */}
          <div className="space-y-3 p-4 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 rounded-lg border-2 border-dashed border-purple-300 dark:border-purple-700">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <Label className="text-base font-semibold">Generate with AI (DALL-E 3)</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="image-prompt">Describe the image you want to generate</Label>
              <Textarea
                id="image-prompt"
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Example: A realistic photo of a lion in the savanna at sunset, high quality, detailed..."
                rows={3}
                className="resize-none"
                disabled={generating}
              />
            </div>
            <Button
              onClick={() => handleGenerateWithAI(0)}
              disabled={generating || !imagePrompt.trim()}
              className="w-full"
              variant="default"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating Image... (30-60s)
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Image with AI
                </>
              )}
            </Button>
            {generating && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  AI image generation takes 30-60 seconds. Please wait...
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Separator className="my-4" />

          {/* Manual Upload Section */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Or Upload / Paste URL</Label>
            <div className="space-y-2">
              <Label htmlFor="image-file">Upload Image</Label>
              <Input type="file" id="image-file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file, 'image'); }} disabled={uploading || generating} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="image-url">Image URL</Label>
              <Input type="url" id="image-url" placeholder="https://example.com/image.jpg" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} disabled={generating} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="image-alt">Alt text (accessibility)</Label>
              <Input type="text" id="image-alt" placeholder="Describe the image..." value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} disabled={generating} />
            </div>
          </div>

          {/* Preview */}
          {imageUrl && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="border rounded-lg p-4 bg-muted/30">
                <img src={imageUrl} alt={imageAlt || 'Preview'} className="max-w-full h-auto max-h-64 rounded mx-auto" />
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="audio" className="space-y-4">
          {/* AI Generation Section */}
          <div className="space-y-3 p-4 bg-gradient-to-br from-green-50 to-teal-50 dark:from-green-950/20 dark:to-teal-950/20 rounded-lg border-2 border-dashed border-green-300 dark:border-green-700">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-green-600 dark:text-green-400" />
              <Label className="text-base font-semibold">Generate with AI (OpenAI TTS)</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="audio-prompt">Enter the text to speak</Label>
              <Textarea
                id="audio-prompt"
                value={audioPrompt}
                onChange={(e) => setAudioPrompt(e.target.value)}
                placeholder="Example: Listen carefully to the following sentence..."
                rows={3}
                className="resize-none"
                disabled={generating}
              />
            </div>
            <Button
              onClick={() => handleGenerateWithAI(0)}
              disabled={generating || !audioPrompt.trim()}
              className="w-full"
              variant="default"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating Audio... (10-20s)
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Audio with AI
                </>
              )}
            </Button>
          </div>

          <Separator className="my-4" />

          {/* Manual Upload Section */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Or Upload / Paste URL</Label>
            <div className="space-y-2">
              <Label htmlFor="audio-file">Upload Audio</Label>
              <Input type="file" id="audio-file" accept="audio/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file, 'audio'); }} disabled={uploading || generating} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audio-url">Audio URL</Label>
              <Input type="url" id="audio-url" placeholder="https://example.com/audio.mp3" value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} disabled={generating} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="audio-transcript-url">Transcript URL (optional)</Label>
              <Input type="url" id="audio-transcript-url" placeholder="https://example.com/transcript.txt" value={audioTranscript} onChange={(e) => setAudioTranscript(e.target.value)} disabled={generating} />
            </div>
          </div>

          {/* Preview */}
          {audioUrl && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="border rounded-lg p-4 bg-muted/30">
                <audio src={audioUrl} controls className="w-full" />
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="video" className="space-y-4">
          {/* AI Generation Section */}
          <div className="space-y-3 p-4 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20 rounded-lg border-2 border-dashed border-orange-300 dark:border-orange-700">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <Label className="text-base font-semibold">Generate with AI (Replicate)</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="video-prompt">Describe the video scene</Label>
              <Textarea
                id="video-prompt"
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                placeholder="Example: A ball rolling down a ramp and bouncing on the ground, physics demonstration..."
                rows={3}
                className="resize-none"
                disabled={generating}
              />
            </div>
            <Button
              onClick={() => handleGenerateWithAI(0)}
              disabled={generating || !videoPrompt.trim()}
              className="w-full"
              variant="default"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating Video... (2-5 min)
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Video with AI
                </>
              )}
            </Button>
            {generating && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Video generation can take 2-5 minutes. We'll notify you when ready.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Separator className="my-4" />

          {/* Manual Upload Section */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Or Upload / Paste URL</Label>
            <div className="space-y-2">
              <Label htmlFor="video-file">Upload Video</Label>
              <Input type="file" id="video-file" accept="video/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file, 'video'); }} disabled={uploading || generating} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="video-url">Video URL</Label>
              <Input type="url" id="video-url" placeholder="https://example.com/video.mp4" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} disabled={generating} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="video-captions-url">Captions URL (optional)</Label>
              <Input type="url" id="video-captions-url" placeholder="https://example.com/captions.vtt" value={videoCaptions} onChange={(e) => setVideoCaptions(e.target.value)} disabled={generating} />
            </div>
          </div>

          {/* Preview */}
          {videoUrl && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="border rounded-lg p-4 bg-muted/30">
                <video src={videoUrl} controls className="w-full max-h-64 rounded mx-auto" />
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="flex gap-2 mt-4">
        <Button onClick={handleAttach} disabled={uploading} className="flex-1"><LinkIcon className="h-4 w-4 mr-2" />Attach</Button>
        {currentStimulus && <Button variant="destructive" onClick={onRemove}>Remove</Button>}
      </div>
    </div>
  );
};
