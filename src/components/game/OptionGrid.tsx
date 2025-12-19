import { useEffect, useRef, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";
import { getOptimizedImageUrl } from "@/lib/utils/imageOptimizer";
import { useResponsiveImageSizing, useResponsiveAudioSizing, getViewport, getOptionImageTargetWidth, getOptionThumbnailWidth } from "@/lib/utils/mediaSizing";
import { fitModeFromRatio, DESIRED_ASPECT } from "@/lib/utils/mediaFit";
import { resolvePublicMediaUrl } from "@/lib/media/resolvePublicMediaUrl";
import type { OptionMedia, ImageMedia, VideoMedia } from "@/lib/media/types";
import { TileImage, TileVideo, TileAudio } from "./OptionGrid/tiles";
import { useStableShuffle, useKeyboardGridNav } from "./OptionGrid/hooks";
import { isAdmin } from "@/lib/api/roles";

interface OptionGridProps {
  options: string[];
  onSelect: (index: number) => void;
  disabled?: boolean;
  selectedIndex?: number;
  isCorrect?: boolean;
  phase?: 'idle' | 'committing' | 'feedback-correct' | 'feedback-wrong' | 'advancing';
  itemId?: number;
  clusterId?: string;
  variant?: string;
  optionMedia?: OptionMedia[];
  courseTitle?: string;
  /** Optional: cache-busting key (e.g., contentVersion or etag) */
  cacheKey?: string;
  /** Optional: course ID for admin edit link */
  courseId?: string;
}


export const OptionGrid = ({
  options,
  onSelect,
  disabled = false,
  selectedIndex,
  isCorrect,
  phase = 'idle',
  itemId,
  clusterId,
  variant,
  optionMedia = [],
  courseTitle: _courseTitle,
  cacheKey,
  courseId,
 }: OptionGridProps) => {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [transcriptStates, setTranscriptStates] = useState<Record<number, { open: boolean; text: string | null; loading: boolean }>>({});
  const [mediaLoadingStates, setMediaLoadingStates] = useState<Record<number, boolean>>({});
  // Dynamic fit states (computed at runtime from natural dimensions)
  const [imageFitStates, setImageFitStates] = useState<Record<number, 'cover' | 'contain'>>({});
  const [videoFitStates, setVideoFitStates] = useState<Record<number, 'cover' | 'contain'>>({});
  const [isAdminUser, setIsAdminUser] = useState(false);
  // Router-free defaults for tests; read URL directly
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  
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
    // Use process.env in tests; avoid import.meta to keep Jest compatibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const envAdmin = (typeof process !== 'undefined' && (process as any).env && ((process as any).env.VITE_FORCE_ADMIN as string)) || undefined;

    const forceAdmin = (urlAdmin === '1') || (localAdmin === '1') || (envAdmin === '1') || refAdmin;

    const isTestEnv = typeof process !== 'undefined' && !!(process.env?.JEST_WORKER_ID || process.env?.NODE_ENV === 'test');
    if (isTestEnv) {
      setIsAdminUser(!!forceAdmin);
    } else {
      isAdmin().then((ok) => setIsAdminUser(!!ok || !!forceAdmin));
    }
  }, [searchParams]);
  
  const handleEditClick = () => {
    if (courseId && itemId) {
      if (typeof window !== 'undefined') {
        window.location.assign(`/admin/editor/${courseId}?itemId=${itemId}`);
      }
    }
  };
  
  // Get responsive sizing and viewport
  const viewport = getViewport();
  const isMobile = viewport === 'mobile';
  const imageSizing = useResponsiveImageSizing('option');
  const audioSizing = useResponsiveAudioSizing('option');

  // Stable shuffle key: combination of itemId, clusterId, and variant
  // This ensures consistent option positions for the same item
  const stableKey = `${itemId}-${clusterId}-${variant}`;

  // Shuffle options with stable ordering per unique item
  // Keep track of original indices to evaluate correctness
  const shuffledOptions = useStableShuffle(
    useMemo(() => options.map((option, originalIndex) => ({ option, originalIndex, media: optionMedia[originalIndex] || null })), [options, optionMedia]),
    stableKey,
  );

  // Handle transcript loading for audio media
  const loadTranscript = async (mediaIndex: number, transcriptUrl: string) => {
    setTranscriptStates(prev => ({ ...prev, [mediaIndex]: { ...prev[mediaIndex], loading: true, open: true } }));
    try {
      const response = await fetch(transcriptUrl);
      if (response.ok) {
        const text = await response.text();
        setTranscriptStates(prev => ({ ...prev, [mediaIndex]: { open: true, text, loading: false } }));
      } else {
        setTranscriptStates(prev => ({ ...prev, [mediaIndex]: { open: true, text: 'Failed to load transcript', loading: false } }));
      }
    } catch {
      setTranscriptStates(prev => ({ ...prev, [mediaIndex]: { open: true, text: 'Error loading transcript', loading: false } }));
    }
  };

  const toggleTranscript = (mediaIndex: number, transcriptUrl?: string) => {
    const state = transcriptStates[mediaIndex];
    if (!state?.open && transcriptUrl && !state?.text && !state?.loading) {
      loadTranscript(mediaIndex, transcriptUrl);
    } else {
      setTranscriptStates(prev => ({ ...prev, [mediaIndex]: { ...prev[mediaIndex], open: !prev[mediaIndex]?.open } }));
    }
  };

  // Focus first button on mount only if not already focused
  useEffect(() => {
    if (!disabled && buttonRefs.current[0] && document.activeElement === document.body) {
      buttonRefs.current[0].focus();
    }
  }, [disabled, shuffledOptions]);

  // Preload all option images for faster display
  useEffect(() => {
    shuffledOptions.forEach(({ media }) => {
      if (media?.type === 'image' && media.url) {
        const optimizedUrl = getOptimizedImageUrl(resolveUrl(media.url), { 
          width: getOptionImageTargetWidth(viewport), 
          quality: imageSizing.quality 
        });
        // Create link element for preloading
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = optimizedUrl;
        document.head.appendChild(link);
      }
    });
  }, [shuffledOptions, viewport, imageSizing.quality]);

  // Keyboard navigation with Enter/Space for selection
  useKeyboardGridNav(disabled, shuffledOptions, buttonRefs.current, (orig) => onSelect(orig));

  const resolveUrl = (url?: string) => resolvePublicMediaUrl(url, cacheKey);

  return (
    <div 
      className={cn(
        "grid w-full max-w-3xl relative group",
        isMobile ? "grid-cols-1 gap-4" : "grid-cols-2 gap-x-12 gap-y-5 px-10"
      )}
      role="group"
      aria-label="Answer options"
      aria-busy={phase !== 'idle'}
    >
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
      {shuffledOptions.map(({ option, originalIndex, media }, displayIndex) => {
        // Check if this original index was selected
        const isSelected = selectedIndex === originalIndex;
        const isLocked = phase !== 'idle';
        const transcriptState = transcriptStates[displayIndex] || { open: false, text: null, loading: false };
        const mediaLoading = mediaLoadingStates[displayIndex] || false;
        
        // Determine if this is a media-only option (no text when media exists)
        const isMediaOnly = !!media && !option;
        const hasTextOverlay = !!media && !!option;

        // Build accessible label
        const mediaLabel = media 
          ? (media.type === 'image' ? (media.alt || 'Image') : media.type === 'audio' ? 'Audio' : 'Video')
          : '';
        const fullLabel = mediaLabel 
          ? `Option ${displayIndex + 1}: ${mediaLabel}${option ? ` - ${option}` : ''}`
          : `Option ${displayIndex + 1}: ${option}`;
        
        return (
          <div key={displayIndex} className="w-full relative" style={{ aspectRatio: '16 / 9' }}>
            <button
              ref={(el) => (buttonRefs.current[displayIndex] = el)}
              onClick={() => !isLocked && onSelect(originalIndex)}
              disabled={isLocked}
              role="button"
              tabIndex={isLocked ? -1 : 0}
              className={cn(
                "group absolute inset-0 rounded-2xl transition-all overflow-hidden",
                "border-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-4",
                "disabled:cursor-not-allowed touch-manipulation",
                // Base interactive states
                !isSelected && !isLocked && "hover:scale-[1.02] active:scale-[0.98]",
                // Selected state (during committing)
                isSelected && phase === 'committing' && "scale-[0.98] border-primary",
                // Default styling
                "bg-card border-border hover:border-primary hover:shadow-lg",
                // Locked state
                isLocked && "opacity-60 pointer-events-none",
                // Layout based on content type
                isMediaOnly && "p-0", // No padding for media-only
                !isMediaOnly && hasTextOverlay && (media?.type === 'image' || media?.type === 'video') && media?.mediaLayout === 'full' && "flex items-center justify-center",
                !isMediaOnly && (!hasTextOverlay || (media?.type !== 'image' && media?.type !== 'video') || media?.mediaLayout !== 'full') && "p-4 flex items-center justify-center",
                !media && "text-base font-semibold flex items-center justify-center" // Text-only styling
              )}
              aria-label={fullLabel}
              aria-pressed={isSelected}
              aria-disabled={isLocked}
              aria-current={isSelected ? "true" : "false"}
            >
            {/* Media-only: Image */}
            {isMediaOnly && media?.type === 'image' && (() => {
              const m = media as ImageMedia;
              const w = typeof m?.width === 'number' ? m.width : undefined;
              const h = typeof m?.height === 'number' ? m.height : undefined;
              const ratio = w && h ? w / h : undefined;
              const auto = ratio ? fitModeFromRatio(ratio, DESIRED_ASPECT) : (imageFitStates[displayIndex] || 'cover');
              const fit = m?.fitMode || auto;
              const fitClass = fit === 'contain' ? 'object-contain bg-black/5' : 'object-cover';
              const optimized = getOptimizedImageUrl(resolveUrl(m.url), { width: getOptionImageTargetWidth(viewport), quality: imageSizing.quality });
              return (
                <TileImage
                  optimizedSrc={optimized}
                  alt={m.alt || `Option ${displayIndex + 1}`}
                  badge={String.fromCharCode(65 + displayIndex)}
                  fitClass={fitClass}
                  loading={mediaLoading}
                  onLoad={(e) => {
                    setMediaLoadingStates(prev => ({ ...prev, [displayIndex]: false }));
                    try {
                      const el = e.currentTarget as HTMLImageElement;
                      const r = el.naturalWidth && el.naturalHeight ? el.naturalWidth / el.naturalHeight : undefined;
                      if (r) setImageFitStates(prev => ({ ...prev, [displayIndex]: fitModeFromRatio(r, DESIRED_ASPECT) }));
                    } catch (_err) { /* noop */ }
                  }}
                  onError={() => setMediaLoadingStates(prev => ({ ...prev, [displayIndex]: false }))}
                />
              );
            })()}

            {/* Media-only: Video */}
            {isMediaOnly && media?.type === 'video' && (() => {
              const m = media as VideoMedia;
              const fitPref = m?.fitMode || videoFitStates[displayIndex];
              const fitClass = fitPref === 'contain' ? 'object-contain bg-black/5' : 'object-cover';
              const src = resolveUrl(m.url);
              return (
                <TileVideo
                  sources={[src]}
                  captionsUrl={m.captionsUrl}
                  badge={String.fromCharCode(65 + displayIndex)}
                  fitClass={fitClass}
                  loading={mediaLoading}
                  onLoadedMetadata={(e) => {
                    setMediaLoadingStates(prev => ({ ...prev, [displayIndex]: false }));
                    try {
                      const el = e.currentTarget as HTMLVideoElement;
                      const r = el.videoWidth && el.videoHeight ? el.videoWidth / el.videoHeight : undefined;
                      if (r) setVideoFitStates(prev => ({ ...prev, [displayIndex]: fitModeFromRatio(r, DESIRED_ASPECT) }));
                    } catch (_err) { /* noop */ }
                  }}
                  onError={() => setMediaLoadingStates(prev => ({ ...prev, [displayIndex]: false }))}
                />
              );
            })()}

            {/* Media-only: Audio */}
            {isMediaOnly && media?.type === 'audio' && (
              <TileAudio
                src={resolveUrl(media.url)}
                transcriptOpen={transcriptState.open}
                badge={String.fromCharCode(65 + displayIndex)}
                onToggleTranscript={() => toggleTranscript(displayIndex, media.transcriptUrl)}
                onLoadedMetadata={() => setMediaLoadingStates(prev => ({ ...prev, [displayIndex]: false }))}
                onError={() => setMediaLoadingStates(prev => ({ ...prev, [displayIndex]: false }))}
                audioHeight={audioSizing.height}
                transcriptText={transcriptState.text}
                transcriptLoading={transcriptState.loading}
              />
            )}

            {/* Text with optional media present in data */}
            {hasTextOverlay && (() => {
              const mediaLayout = (media && (media.type === 'image' || media.type === 'video') ? media.mediaLayout : undefined) ?? 'full';
              
              // Full-bleed with 16:9 aspect ratio
              if (media?.type === 'image' && mediaLayout === 'full') {
                return (
                  <>
                    <img
                      src={getOptimizedImageUrl(resolveUrl(media.url), { width: getOptionImageTargetWidth(viewport), quality: imageSizing.quality })}
                      alt={media.alt || ''}
                      className="absolute inset-0 w-full h-full object-cover"
                      loading={displayIndex < 2 ? "eager" : "lazy"}
                      {...(displayIndex < 2 ? { fetchpriority: "high" as const } : {})}
                      decoding="async"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent pointer-events-none" />
                    <div className="absolute inset-0 p-4 flex items-center gap-2 z-10">
                      <Badge variant="outline" className="flex-shrink-0 bg-white/70 backdrop-blur-xs">
                        {String.fromCharCode(65 + displayIndex)}
                      </Badge>
                      <span className="text-lg font-semibold text-white drop-shadow">{option}</span>
                    </div>
                    {isSelected && isCorrect !== undefined && (
                      <Badge 
                        className={cn(
                          "absolute top-2 right-2 border-0 z-20",
                          isCorrect ? "bg-green-600 text-white" : "bg-red-600 text-white"
                        )}
                      >
                        {isCorrect ? '✓' : '✗'}
                      </Badge>
                    )}
                  </>
                );
              }
              
              // Thumbnail or non-full-bleed layout
              return (
              <div className="relative min-h-16 p-4 flex items-center gap-3">
                {media?.type === 'image' && (
                  <div className="relative w-16 h-10 rounded-md overflow-hidden bg-muted flex-shrink-0">
                    <img
                      src={getOptimizedImageUrl(resolveUrl(media.url), { width: getOptionThumbnailWidth(viewport), quality: 70 })}
                      alt={media.alt || ''}
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                )}
                {media?.type === 'video' && (
                  <div className="w-16 h-10 rounded-md bg-muted flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0">
                    video
                  </div>
                )}
                <Badge variant="outline" className="flex-shrink-0">
                  {String.fromCharCode(65 + displayIndex)}
                </Badge>
                <span className="text-lg font-semibold">{option}</span>
                {isSelected && isCorrect !== undefined && (
                  <Badge 
                    className={cn(
                      "absolute top-2 right-2 border-0",
                      isCorrect ? "bg-green-600 text-white" : "bg-red-600 text-white"
                    )}
                  >
                    {isCorrect ? '✓' : '✗'}
                  </Badge>
                )}
              </div>
              );
            })()}

            {/* Text-only option */}
            {!media && option && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="flex-shrink-0">
                  {String.fromCharCode(65 + displayIndex)}
                </Badge>
                <span>{option}</span>
              </div>
            )}
            </button>
          </div>
        );
      })}
    </div>
  );
};
