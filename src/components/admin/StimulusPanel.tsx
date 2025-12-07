import { useState } from "react";
import { X, Link as LinkIcon, Image as ImageIcon, Music, Video, Loader2, Sparkles, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useMCP } from "@/hooks/useMCP";
import { toast } from "sonner";
import { Stem } from "@/components/game/Stem";

interface StimulusPanelProps {
  itemId: number;
  courseId: string;
  currentStimulus?: {
    type: 'image' | 'audio' | 'video';
    url: string;
    alt?: string;
    transcriptUrl?: string;
    captionsUrl?: string;
  };
  onAttach: (stimulus: {
    type: 'image' | 'audio' | 'video';
    url: string;
    alt?: string;
    transcriptUrl?: string;
    captionsUrl?: string;
  }) => void;
  onRemove: () => void;
  onClose: () => void;
  itemText?: string;
  courseTitle?: string;
}

const MAX_FILE_SIZES = {
  image: 2 * 1024 * 1024, // 2MB
  audio: 5 * 1024 * 1024, // 5MB
  video: 15 * 1024 * 1024, // 15MB
};

const ALLOWED_TYPES = {
  image: ['image/webp', 'image/png'],
  audio: ['audio/mpeg', 'audio/mp3'],
  video: ['video/mp4'],
};

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const StimulusPanel = ({
  itemId,
  courseId,
  currentStimulus,
  onAttach,
  onRemove,
  onClose,
  itemText,
  courseTitle,
}: StimulusPanelProps) => {
  const mcp = useMCP();
  const [activeTab, setActiveTab] = useState<'image' | 'audio' | 'video'>(
    currentStimulus?.type || 'image'
  );

  // Manual URL entry state
  const [manualUrl, setManualUrl] = useState(currentStimulus?.url || "");
  const [imageAlt, setImageAlt] = useState(currentStimulus?.alt || "");
  const [audioTranscriptUrl, setAudioTranscriptUrl] = useState(currentStimulus?.transcriptUrl || "");
  const [videoCaptionsUrl, setVideoCaptionsUrl] = useState(currentStimulus?.captionsUrl || "");

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [_uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  // AI Generation state
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  const validateFile = (file: File, type: 'image' | 'audio' | 'video'): string | null => {
    if (file.size > MAX_FILE_SIZES[type]) {
      return `File size must be less than ${MAX_FILE_SIZES[type] / 1024 / 1024}MB`;
    }
    if (!ALLOWED_TYPES[type].includes(file.type)) {
      return `Invalid file type. Allowed: ${ALLOWED_TYPES[type].join(', ')}`;
    }
    return null;
  };

  const handleFileUpload = async (file: File, type: 'image' | 'audio' | 'video') => {
    const error = validateFile(file, type);
    if (error) {
      toast.error(error);
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Generate UUID filename
      const uuid = generateUUID();
      const extension = file.name.split('.').pop() || (type === 'image' ? 'png' : type === 'audio' ? 'mp3' : 'mp4');
      const filename = `${uuid}.${extension}`;
      
      // Construct storage path
      const folder = type === 'image' ? 'images' : type === 'audio' ? 'audio' : 'video';
      const storagePath = `${courseId}/assets/${folder}/${filename}`;

      // Upload via edge function (IgniteZero compliant)
      const result = await mcp.uploadMediaFile(file, storagePath);

      if (!result.ok) {
        throw new Error('Upload failed');
      }

      setUploadProgress(100);

      setUploadedUrl(result.url);
      setManualUrl(result.url);
      
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} uploaded successfully`);
    } catch (err) {
      console.error("Upload error:", err);
      toast.error(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleAttach = () => {
    if (!manualUrl.trim()) {
      toast.error("Please provide a URL");
      return;
    }

    if (activeTab === 'image') {
      if (!imageAlt.trim()) {
        toast.error("Alt text is required for images");
        return;
      }
      onAttach({
        type: 'image',
        url: manualUrl.trim(),
        alt: imageAlt.trim(),
      });
    } else if (activeTab === 'audio') {
      onAttach({
        type: 'audio',
        url: manualUrl.trim(),
        transcriptUrl: audioTranscriptUrl.trim() || undefined,
      });
    } else if (activeTab === 'video') {
      onAttach({
        type: 'video',
        url: manualUrl.trim(),
        captionsUrl: videoCaptionsUrl.trim() || undefined,
      });
    }

    toast.success("Stimulus attached");
    onClose();
  };

  const handleGenerateWithAI = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Please enter a prompt for AI generation');
      return;
    }

    setGenerating(true);
    try {
      const idempotencyKey = `media-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      
      const { data: job, error: insertError } = await (supabase as any)
        .from('ai_media_jobs')
        .insert({
          course_id: courseId,
          item_id: itemId,
          media_type: activeTab,
          prompt: aiPrompt,
          provider: activeTab === 'video' ? 'replicate' : 'openai',
          idempotency_key: idempotencyKey,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast.success('AI generation started. Polling...');

      const maxPolls = 60;
      let polls = 0;

      while (polls < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 5000));

        const { data: updatedJob, error: pollError } = await (supabase as any)
          .from('ai_media_jobs')
          .select('*')
          .eq('id', job.id)
          .single();

        if (pollError) throw pollError;

        if (updatedJob.status === 'done') {
          setManualUrl(updatedJob.result_url);
          // setUploadedUrl(updatedJob.result_url); // Unused - removed
          
          if (activeTab === 'image' && updatedJob.metadata?.revised_prompt) {
            setImageAlt(updatedJob.metadata.revised_prompt);
          }
          if (activeTab === 'audio' && updatedJob.metadata?.transcriptUrl) {
            setAudioTranscriptUrl(updatedJob.metadata.transcriptUrl);
          }
          if (activeTab === 'video' && updatedJob.metadata?.captionsUrl) {
            setVideoCaptionsUrl(updatedJob.metadata.captionsUrl);
          }

          toast.success(`AI ${activeTab} generated!`);
          return;
        }

        if (updatedJob.status === 'failed' || updatedJob.status === 'dead_letter') {
          throw new Error(updatedJob.error || 'Generation failed');
        }

        polls++;
      }

      throw new Error('AI generation timed out');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`AI generation failed: ${errorMsg}`);
    } finally {
      setGenerating(false);
    }
  };

  const previewStimulus = currentStimulus || (manualUrl.trim() ? 
    (activeTab === 'image' ? {
      type: 'image' as const,
      url: manualUrl.trim(),
      alt: imageAlt.trim() || undefined,
    } : activeTab === 'audio' ? {
      type: 'audio' as const,
      url: manualUrl.trim(),
      transcriptUrl: audioTranscriptUrl.trim() || undefined,
    } : {
      type: 'video' as const,
      url: manualUrl.trim(),
      captionsUrl: videoCaptionsUrl.trim() || undefined,
    }) : undefined);

  return (
    <div className="bg-background border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Stimulus Media</Label>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'image' | 'audio' | 'video')}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="image">
            <ImageIcon className="h-4 w-4 mr-2" />
            Image
          </TabsTrigger>
          <TabsTrigger value="audio">
            <Music className="h-4 w-4 mr-2" />
            Audio
          </TabsTrigger>
          <TabsTrigger value="video">
            <Video className="h-4 w-4 mr-2" />
            Video
          </TabsTrigger>
        </TabsList>

        {/* Image Tab */}
        <TabsContent value="image" className="space-y-4 mt-4">
          {/* AI Generation Section */}
          <div className="space-y-3 p-3 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 rounded-lg border-2 border-dashed border-purple-300 dark:border-purple-700">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <Label className="text-sm font-semibold">Generate with AI (DALL-E 3)</Label>
            </div>
            <div className="space-y-2">
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe the image: a red apple on a wooden table, high quality..."
                rows={2}
                className="resize-none text-sm"
                disabled={generating}
              />
            </div>
            <Button
              onClick={handleGenerateWithAI}
              disabled={generating || !aiPrompt.trim()}
              size="sm"
              className="w-full"
            >
              {generating ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Generating... (30-60s)
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3 mr-2" />
                  Generate Image
                </>
              )}
            </Button>
          </div>

          <Separator />

          <Alert>
            <AlertDescription className="text-xs">
              Upload images (WebP, PNG) up to 2MB or enter a URL manually
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <div>
              <Label htmlFor={`image-file-${itemId}`} className="text-xs mb-2 block">
                Upload Image
              </Label>
              <Input
                id={`image-file-${itemId}`}
                type="file"
                accept=".webp,.png"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, 'image');
                }}
                className="text-sm"
              />
            </div>

            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Uploading...</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or enter URL</span>
              </div>
            </div>

            <div>
              <Label htmlFor={`image-url-${itemId}`} className="text-xs mb-2 block">
                Image URL
              </Label>
              <Input
                id={`image-url-${itemId}`}
                placeholder="https://example.com/image.png"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                className="text-sm"
              />
            </div>

            <div>
              <Label htmlFor={`image-alt-${itemId}`} className="text-xs mb-2 block">
                Alt Text (Required) <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`image-alt-${itemId}`}
                placeholder="Description for accessibility"
                value={imageAlt}
                onChange={(e) => setImageAlt(e.target.value)}
                className="text-sm"
                required
              />
            </div>
          </div>
        </TabsContent>

        {/* Audio Tab */}
        <TabsContent value="audio" className="space-y-4 mt-4">
          {/* AI Generation Section */}
          <div className="space-y-3 p-3 bg-gradient-to-br from-green-50 to-teal-50 dark:from-green-950/20 dark:to-teal-950/20 rounded-lg border-2 border-dashed border-green-300 dark:border-green-700">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-green-600 dark:text-green-400" />
              <Label className="text-sm font-semibold">Generate with AI (TTS)</Label>
            </div>
            <div className="space-y-2">
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Enter text to speak: The cat sat on the mat..."
                rows={2}
                className="resize-none text-sm"
                disabled={generating}
              />
            </div>
            <Button
              onClick={handleGenerateWithAI}
              disabled={generating || !aiPrompt.trim()}
              size="sm"
              className="w-full"
            >
              {generating ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Generating... (10-20s)
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3 mr-2" />
                  Generate Audio
                </>
              )}
            </Button>
          </div>

          <Separator />

          <Alert>
            <AlertDescription className="text-xs">
              Upload audio (MP3) up to 5MB or enter a URL manually
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <div>
              <Label htmlFor={`audio-file-${itemId}`} className="text-xs mb-2 block">
                Upload Audio
              </Label>
              <Input
                id={`audio-file-${itemId}`}
                type="file"
                accept=".mp3,audio/mpeg"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, 'audio');
                }}
                className="text-sm"
              />
            </div>

            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Uploading...</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or enter URL</span>
              </div>
            </div>

            <div>
              <Label htmlFor={`audio-url-${itemId}`} className="text-xs mb-2 block">
                Audio URL
              </Label>
              <Input
                id={`audio-url-${itemId}`}
                placeholder="https://example.com/audio.mp3"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                className="text-sm"
              />
            </div>

            <div>
              <Label htmlFor={`audio-transcript-${itemId}`} className="text-xs mb-2 block">
                Transcript URL (Optional)
              </Label>
              <Input
                id={`audio-transcript-${itemId}`}
                placeholder="https://example.com/transcript.txt"
                value={audioTranscriptUrl}
                onChange={(e) => setAudioTranscriptUrl(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
        </TabsContent>

        {/* Video Tab */}
        <TabsContent value="video" className="space-y-4 mt-4">
          {/* AI Generation Section */}
          <div className="space-y-3 p-3 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20 rounded-lg border-2 border-dashed border-orange-300 dark:border-orange-700">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <Label className="text-sm font-semibold">Generate with AI (Replicate)</Label>
            </div>
            <div className="space-y-2">
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe video scene: a ball rolling down a ramp..."
                rows={2}
                className="resize-none text-sm"
                disabled={generating}
              />
            </div>
            <Button
              onClick={handleGenerateWithAI}
              disabled={generating || !aiPrompt.trim()}
              size="sm"
              className="w-full"
            >
              {generating ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Generating... (2-5 min)
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3 mr-2" />
                  Generate Video
                </>
              )}
            </Button>
            {generating && (
              <Alert className="py-2">
                <Info className="h-3 w-3" />
                <AlertDescription className="text-xs">
                  Video generation takes 2-5 minutes
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Separator />

          <Alert>
            <AlertDescription className="text-xs">
              Upload video (MP4) up to 15MB or enter a URL manually
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <div>
              <Label htmlFor={`video-file-${itemId}`} className="text-xs mb-2 block">
                Upload Video
              </Label>
              <Input
                id={`video-file-${itemId}`}
                type="file"
                accept=".mp4,video/mp4"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, 'video');
                }}
                className="text-sm"
              />
            </div>

            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Uploading...</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or enter URL</span>
              </div>
            </div>

            <div>
              <Label htmlFor={`video-url-${itemId}`} className="text-xs mb-2 block">
                Video URL
              </Label>
              <Input
                id={`video-url-${itemId}`}
                placeholder="https://example.com/video.mp4"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                className="text-sm"
              />
            </div>

            <div>
              <Label htmlFor={`video-captions-${itemId}`} className="text-xs mb-2 block">
                Captions URL (Optional)
              </Label>
              <Input
                id={`video-captions-${itemId}`}
                placeholder="https://example.com/captions.vtt"
                value={videoCaptionsUrl}
                onChange={(e) => setVideoCaptionsUrl(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleAttach}
          disabled={!manualUrl.trim() || (activeTab === 'image' && !imageAlt.trim()) || uploading}
          className="flex-1"
        >
          <LinkIcon className="h-3 w-3 mr-1" />
          Attach
        </Button>

        {currentStimulus && (
          <Button size="sm" variant="destructive" onClick={onRemove}>
            <X className="h-3 w-3 mr-1" />
            Remove
          </Button>
        )}
      </div>

      {/* Preview */}
      {previewStimulus && itemText && (
        <div className="bg-muted border rounded-lg p-3">
          <Label className="text-xs text-muted-foreground mb-2 block">Preview</Label>
          <Stem
            text={itemText}
            stimulus={
              previewStimulus.type === 'image' ? {
                type: 'image' as const,
                url: previewStimulus.url,
                alt: previewStimulus.alt,
              } : previewStimulus.type === 'audio' ? {
                type: 'audio' as const,
                url: previewStimulus.url,
                transcriptUrl: previewStimulus.transcriptUrl,
              } : {
                type: 'video' as const,
                url: previewStimulus.url,
                captionsUrl: previewStimulus.captionsUrl,
              }
            }
            courseTitle={courseTitle || "Preview"}
            itemId={itemId}
            className="text-sm"
          />
        </div>
      )}
    </div>
  );
};
