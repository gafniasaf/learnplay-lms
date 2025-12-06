import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, Edit } from "lucide-react";
import { getOptimizedImageUrl } from "@/lib/utils/imageOptimizer";
import { useResponsiveImageSizing, useResponsiveAudioSizing, getViewport } from "@/lib/utils/mediaSizing";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { isAdmin } from "@/lib/api/roles";
import { useNavigate, useSearchParams } from "react-router-dom";

interface StemMedia {
  type: 'image' | 'audio' | 'video';
  url: string;
  alt?: string;
  transcriptUrl?: string;
  captionsUrl?: string;
}

interface StemProps {
  text: string;
  className?: string;
  stimulus?: 
    | { type: 'image'; url: string; alt?: string }
    | { type: 'audio'; url: string; transcriptUrl?: string }
    | { type: 'video'; url: string; captionsUrl?: string };
  /** Optional: new schema media list (item.stem.media) */
  stemMedia?: StemMedia[] | null;
  courseTitle?: string;
  itemId?: number;
  /** Optional: cache-busting key (e.g., contentVersion or etag) */
  cacheKey?: string;
  /** Optional: course ID for admin edit link */
  courseId?: string;
}

export const Stem = ({ text, className = "", stimulus, stemMedia, courseTitle, itemId, cacheKey, courseId }: StemProps) => {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Check admin status (with dev overrides including top-level referrer param)
  useEffect(() => {
    let refAdmin = false;
    try {
      if (typeof document !== 'undefined' && document.referrer) {
        const u = new URL(document.referrer);
        refAdmin = u.searchParams.get('admin') === '1';
      }
    } catch {
      // Ignore URL parsing errors (invalid referrer)
    }

    const urlAdmin = searchParams.get('admin');
    const localAdmin = typeof localStorage !== 'undefined' ? localStorage.getItem('force_admin') : null;
    const envAdmin = ((typeof process !== 'undefined' ? (process as any).env?.VITE_FORCE_ADMIN : undefined) as string | undefined);

    const forceAdmin = (urlAdmin === '1') || (localAdmin === '1') || (envAdmin === '1') || refAdmin;
    isAdmin().then((ok) => setIsAdminUser(!!ok || !!forceAdmin));
  }, [searchParams]);
  
  // Get responsive sizing
  const imageSizing = useResponsiveImageSizing('stem');
  const audioSizing = useResponsiveAudioSizing('stem');
  const viewport = getViewport();
  const isMobile = viewport === 'mobile';
  
  // Normalize placeholder format (both _ and [blank] supported)
  const normalizedText = text.replace(/\[blank\]/g, "_");
  
  // Split text by underscore to highlight the blank
  const parts = normalizedText.split("_");
  
  // Create accessible label
  const ariaLabel = `Question: ${text.replace(/_/g, "blank").replace(/\[blank\]/g, "blank")}`;

  // Derive primary media from various shapes and normalize to { type, url }
  const s: any = stimulus as any;
  const guessTypeFromUrl = (u?: string): 'image' | 'audio' | 'video' | undefined => {
    if (!u) return undefined;
    const low = u.toLowerCase();
    if (/(\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg)(\?|$)/.test(low)) return 'image';
    if (/(\.mp3|\.wav|\.ogg|\.m4a|\.aac|\.flac)(\?|$)/.test(low)) return 'audio';
    if (/(\.mp4|\.webm|\.mov|\.avi|\.mkv)(\?|$)/.test(low)) return 'video';
    return undefined;
  };
  const rawSrc = (m: any) => m?.url || m?.public_url || m?.path || m?.storagePath || m?.key;
  const normalize = (m: any): StemMedia | undefined => {
    if (!m) return undefined;
    const url = rawSrc(m);
    const type = m.type || guessTypeFromUrl(url);
    if (!url || !type) return undefined;
    return { type, url, alt: m.alt, transcriptUrl: m.transcriptUrl, captionsUrl: m.captionsUrl } as StemMedia;
  };
  const fromLegacy = normalize(s);
  const fromStimulusArray = Array.isArray(s?.media) ? normalize(s.media.find((mm: any) => normalize(mm))) : undefined;
  const fromStemArray = Array.isArray(stemMedia) ? normalize(stemMedia.find((mm: any) => normalize(mm))) : undefined;
  const primaryMedia: StemMedia | undefined = fromLegacy || fromStimulusArray || fromStemArray;

  // Preload stem image for faster display
  useEffect(() => {
    if (primaryMedia?.type === 'image' && primaryMedia.url) {
      const optimizedUrl = getOptimizedImageUrl(resolveUrl(primaryMedia.url), { 
        width: imageSizing.maxWidth, 
        quality: imageSizing.quality 
      });
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = optimizedUrl;
      document.head.appendChild(link);
    }
  }, [primaryMedia?.url, imageSizing.maxWidth, imageSizing.quality]);

  // Normalize to absolute public URL for storage-relative paths
  const supabaseUrl = ((typeof process !== 'undefined' ? (process as any).env?.VITE_SUPABASE_URL : undefined) as string | undefined);
  const resolveUrl = (url?: string) => {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) {
      return appendVersion(url, cacheKey);
    }
    const base = (supabaseUrl || '').replace(/\/$/, '');
    const clean = url.replace(/^\//, '');
    const path = clean.startsWith('courses/') ? clean : `courses/${clean}`;
    return appendVersion(`${base}/storage/v1/object/public/${path}`, cacheKey);
  };

  const appendVersion = (u: string, v?: string) => {
    if (!v) return u;
    try {
      const o = new URL(u);
      o.searchParams.set('v', v);
      return o.toString();
    } catch {
      // Fallback: append naively
      return u + (u.includes('?') ? `&v=${encodeURIComponent(v)}` : `?v=${encodeURIComponent(v)}`);
    }
  };

  // Generate alt text for image if missing
  const imageAlt = primaryMedia?.type === 'image' ? ((primaryMedia as any).alt || `${courseTitle || 'Course'} - Item ${itemId || ''}`) : '';

  // Load transcript when collapsible is opened
  const handleTranscriptToggle = async (open: boolean) => {
    setTranscriptOpen(open);
    
    if (open && primaryMedia?.type === 'audio' && (primaryMedia as any).transcriptUrl && !transcript && !loadingTranscript) {
      setLoadingTranscript(true);
      try {
        const response = await fetch((primaryMedia as any).transcriptUrl);
        if (response.ok) {
          const text = await response.text();
          setTranscript(text);
        } else {
          setTranscript('Failed to load transcript');
        }
      } catch (error) {
        console.error('Error loading transcript:', error);
        setTranscript('Error loading transcript');
      } finally {
        setLoadingTranscript(false);
      }
    }
  };
  
  // Skeleton component for loading states
  const MediaSkeleton = ({ type }: { type: 'image' | 'video' | 'audio' }) => {
    if (type === 'audio') {
      return (
        <div className="bg-muted/50 rounded-lg p-4 animate-pulse" style={{ maxWidth: audioSizing.maxWidth }}>
          <div className="bg-muted rounded h-12 w-full" />
        </div>
      );
    }
    
    return (
      <div className="bg-muted rounded-lg animate-pulse" style={{ width: imageSizing.maxWidth, maxWidth: imageSizing.maxWidth }}>
        <AspectRatio ratio={16 / 9}>
          <div className="bg-muted w-full h-full rounded-lg" />
        </AspectRatio>
      </div>
    );
  };

  const renderMedia = () => {
    if (!primaryMedia) return null;

    const mediaContent = (() => {
      switch (primaryMedia.type) {
        case 'image':
          return (
            <div className="relative" style={{ width: imageSizing.maxWidth, maxWidth: imageSizing.maxWidth }}>
              {mediaLoading && <MediaSkeleton type="image" />}
              <AspectRatio ratio={16 / 9} className={mediaLoading ? 'absolute inset-0 opacity-0' : ''}>
                <img
                  src={getOptimizedImageUrl(resolveUrl(primaryMedia.url), { width: imageSizing.maxWidth, quality: imageSizing.quality })}
                  alt={imageAlt}
                  className="w-full h-full object-contain rounded-lg"
                  loading="eager"
                  {...({ fetchpriority: "high" as const })}
                  decoding="async"
                  onLoad={() => setMediaLoading(false)}
                  onError={() => setMediaLoading(false)}
                />
              </AspectRatio>
            </div>
          );
        
        case 'video':
          return (
            <div className="relative" style={{ width: imageSizing.maxWidth, maxWidth: imageSizing.maxWidth }}>
              {mediaLoading && <MediaSkeleton type="video" />}
              <div className={cn("bg-muted/50 rounded-lg p-4", mediaLoading && 'absolute inset-0 opacity-0')}>
                <AspectRatio ratio={16 / 9}>
                  <video
                    controls
                    preload="metadata"
                    className="w-full h-full rounded"
                    aria-label={`Video for ${courseTitle || 'course'} item ${itemId || ''}`}
                    onLoadedMetadata={() => setMediaLoading(false)}
                    onError={() => setMediaLoading(false)}
                  >
                    <source src={resolveUrl(primaryMedia.url)} type="video/mp4" />
                    <source src={resolveUrl(primaryMedia.url)} type="video/webm" />
                    <source src={resolveUrl(primaryMedia.url)} type="video/ogg" />
                    {(primaryMedia as any)?.captionsUrl && (
                      <track
                        kind="captions"
                        src={(primaryMedia as any).captionsUrl}
                        srcLang="en"
                        label="English"
                        default
                      />
                    )}
                    Your browser does not support the video element.
                  </video>
                </AspectRatio>
              </div>
            </div>
          );
        
        case 'audio':
          return (
            <div className="space-y-3" style={{ width: audioSizing.maxWidth, maxWidth: audioSizing.maxWidth }}>
              <div className="relative">
                {mediaLoading && <MediaSkeleton type="audio" />}
                <div className={cn("bg-muted/50 rounded-lg p-4", mediaLoading && 'absolute inset-0 opacity-0')}>
                  <audio
                    controls
                    preload="metadata"
                    className="w-full"
                    style={{ height: audioSizing.height }}
                    aria-label={`Audio for ${courseTitle || 'course'} item ${itemId || ''}`}
                    onLoadedMetadata={() => setMediaLoading(false)}
                    onError={() => setMediaLoading(false)}
                  >
                    <source src={resolveUrl(primaryMedia.url)} type="audio/mpeg" />
                    <source src={resolveUrl(primaryMedia.url)} type="audio/ogg" />
                    <source src={resolveUrl(primaryMedia.url)} type="audio/wav" />
                    Your browser does not support the audio element.
                  </audio>
                </div>
              </div>

              {(primaryMedia as any)?.transcriptUrl && (
                <Collapsible open={transcriptOpen} onOpenChange={handleTranscriptToggle}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-sm"
                      aria-expanded={transcriptOpen}
                      aria-controls="audio-transcript"
                    >
                      <ChevronDown
                        className={`h-4 w-4 mr-2 transition-transform ${transcriptOpen ? 'rotate-180' : ''}`}
                      />
                      {transcriptOpen ? 'Hide' : 'Show'} Transcript
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent
                    id="audio-transcript"
                    className="mt-2 p-4 bg-muted/30 rounded-lg text-sm leading-relaxed"
                  >
                    {loadingTranscript ? (
                      <p className="text-muted-foreground italic">Loading transcript...</p>
                    ) : transcript ? (
                      <p className="whitespace-pre-wrap">{transcript}</p>
                    ) : null}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          );
        
        default:
          return null;
      }
    })();

    return mediaContent;
  };

  const textContent = (
    <div 
      className={cn(
        "text-lg md:text-xl font-semibold leading-snug text-foreground",
        className
      )}
      role="heading"
      aria-level={2}
      aria-label={ariaLabel}
      aria-live="polite"
    >
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 && (
            <span 
              className="inline-block min-w-[80px] border-b-4 border-primary mx-2 animate-pulse" 
              aria-label="blank space to fill"
              role="presentation"
            />
          )}
        </span>
      ))}
    </div>
  );

  const handleEditClick = () => {
    if (courseId && itemId) {
      navigate(`/admin/editor/${courseId}?itemId=${itemId}`);
    }
  };

  return (
    <div className="w-full max-w-3xl relative group">
      {isAdminUser && courseId && itemId && (
        <Button
          size="sm"
          variant="outline"
          className="absolute top-2 right-2 z-50 opacity-100 pointer-events-auto shadow-lg"
          onClick={handleEditClick}
          title="Edit item in course editor"
          data-testid="admin-edit-button"
        >
          <Edit className="h-4 w-4" />
        </Button>
      )}
      {primaryMedia && !isMobile ? (
        // Desktop: side-by-side layout
        <div className="flex gap-6 items-center min-h-[15vh] max-h-[180px] bg-muted/10 rounded-2xl p-5 border-2 border-border">
          <div className="flex-shrink-0">
            {renderMedia()}
          </div>
          <div className="flex-1 min-w-0">
            {textContent}
          </div>
        </div>
      ) : (
        // Mobile: stacked layout
        <div className="min-h-[18vh] max-h-[150px] bg-muted/10 rounded-xl p-4 flex flex-col gap-3 justify-center border-2 border-border">
          {primaryMedia && (
            <div className="flex justify-center">
              {renderMedia()}
            </div>
          )}
          {textContent}
        </div>
      )}
    </div>
  );
};
