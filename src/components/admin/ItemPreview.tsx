import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getOptimizedImageUrl } from "@/lib/utils/imageOptimizer";
import { cn } from "@/lib/utils";
import type { CourseItemV2 } from "@/lib/schemas/courseV2";

interface ItemPreviewProps {
  item: CourseItemV2;
  courseTitle?: string;
}

export const ItemPreview = ({ item, courseTitle }: ItemPreviewProps) => {
  // Prefer new schema (item.stem.text, item.stem.media), fall back to legacy (item.text, item.stimulus)
  const stemText = (item as any)?.stem?.text || (item as any)?.text || '';
  const stemMediaRaw: any[] = ((item as any)?.stem?.media || (item as any)?.stimulus?.media || []) as any[];
  const legacyStimulus: any = (item as any)?.stimulus;

  // Normalize media entries to a common shape { type, url, alt }
  const guessTypeFromUrl = (u: string | undefined): 'image' | 'audio' | 'video' | undefined => {
    if (!u) return undefined;
    const low = u.toLowerCase();
    if (/(\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg)(\?|$)/.test(low)) return 'image';
    if (/(\.mp3|\.wav|\.ogg|\.m4a|\.aac|\.flac)(\?|$)/.test(low)) return 'audio';
    if (/(\.mp4|\.webm|\.mov|\.avi|\.mkv)(\?|$)/.test(low)) return 'video';
    return undefined;
  };

  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
  const toPublicUrl = (path: string) => {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    // treat as storage relative path inside courses bucket
    return `${supabaseUrl?.replace(/\/$/, '') || ''}/storage/v1/object/public/courses/${path.replace(/^\//, '')}`;
  };

  const normalize = (m: any) => {
    if (!m) return null;
    const url = m.url || m.public_url || toPublicUrl(m.path || m.storagePath || m.key || '');
    const type = m.type || guessTypeFromUrl(url);
    if (!url || !type) return null;
    return { type, url, alt: m.alt || m.description || '' } as { type: 'image' | 'audio' | 'video'; url: string; alt?: string };
  };

  const stemMedia = stemMediaRaw.map(normalize).filter(Boolean) as Array<{ type: 'image' | 'audio' | 'video'; url: string; alt?: string }>;

  // Primary media to preview (first image/audio/video) – legacy stimulus takes precedence if singular
  const primaryMedia = legacyStimulus?.url ? normalize(legacyStimulus) : (stemMedia[0] || null);

  // Normalize placeholder format (both _ and [blank] supported)
  const normalizedText = stemText.replace(/\[blank\]/g, "_");
  // Split text by underscore to highlight the blank visually
  const parts = normalizedText.split("_");

  // Inline media token handling – if [media] appears, render inline
  const hasInlineMedia = /\[media\]/i.test(stemText);
  const textParts = hasInlineMedia ? stemText.split(/\[media\]/i) : null;

  // Alt text
  const imageAlt = primaryMedia?.type === 'image'
    ? (primaryMedia.alt || `${courseTitle || 'Course'} - Item ${item.id || ''}`)
    : '';

  return (
    <div className="space-y-4 p-6 bg-gradient-to-br from-primary/5 via-background to-accent/5 rounded-xl border-2">
      <div className="flex items-center justify-between mb-4">
        <Badge variant="secondary" className="text-xs">Live Preview</Badge>
        <span className="text-xs text-muted-foreground">ID: {item.id}</span>
      </div>

      {/* Question Stem Card */}
      <Card className="p-5 shadow-lg">
        <div className="space-y-4">
          {/* Above-stem media (new + legacy) */}
          {primaryMedia && !hasInlineMedia && (
            <>
              {primaryMedia.type === 'image' && (
                <div className="w-full max-w-2xl mx-auto">
                  <AspectRatio ratio={16 / 9}>
                    <img
                      src={getOptimizedImageUrl(primaryMedia.url, { width: 800, quality: 85 })}
                      alt={imageAlt}
                      className="w-full h-full object-contain rounded-lg"
                      loading="lazy"
                      decoding="async"
                    />
                  </AspectRatio>
                </div>
              )}

              {primaryMedia.type === 'audio' && (
                <div className="w-full max-w-2xl mx-auto">
                  <div className="bg-muted/50 rounded-lg p-4">
                    <audio
                      controls
                      preload="metadata"
                      className="w-full"
                      aria-label={`Audio for ${courseTitle || 'course'} item ${item.id || ''}`}
                    >
                      <source src={primaryMedia.url} type="audio/mpeg" />
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                </div>
              )}

              {primaryMedia.type === 'video' && (
                <div className="w-full max-w-3xl mx-auto">
                  <div className="bg-muted/50 rounded-lg p-4">
                    <AspectRatio ratio={16 / 9}>
                      <video
                        controls
                        preload="metadata"
                        className="w-full h-full rounded"
                        aria-label={`Video for ${courseTitle || 'course'} item ${item.id || ''}`}
                      >
                        <source src={primaryMedia.url} type="video/mp4" />
                        Your browser does not support the video element.
                      </video>
                    </AspectRatio>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Question Stem with inline media support */}
          <div className="text-xl md:text-2xl font-semibold leading-relaxed text-foreground text-center">
            {hasInlineMedia && textParts ? (
              <>
                {textParts[0]}
                {primaryMedia && (
                  <div className="inline-block mx-2 align-middle">
                    {primaryMedia.type === 'image' && (
                      <img
                        src={getOptimizedImageUrl(primaryMedia.url, { width: 200, quality: 85 })}
                        alt={imageAlt}
                        className="inline-block max-w-[200px] max-h-[100px] object-contain rounded"
                      />
                    )}
                    {primaryMedia.type === 'audio' && (
                      <audio controls className="inline-block max-w-[200px]" src={primaryMedia.url} />
                    )}
                  </div>
                )}
                {textParts[1]}
              </>
            ) : (
              parts.map((part, index) => (
                <span key={index}>
                  {part}
                  {index < parts.length - 1 && (
                    <span className="inline-block min-w-[80px] border-b-4 border-primary mx-2 animate-pulse" />
                  )}
                </span>
              ))
            )}
          </div>
        </div>
      </Card>

      {/* Stem media gallery (if multiple media attached) */}
      {stemMedia.length > 1 && (
        <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-3">
          {stemMedia.map((m, i) => (
            <div key={i} className="border rounded-lg p-2 bg-card">
              {m.type === 'image' && (
                <AspectRatio ratio={16/9}>
                  <img src={getOptimizedImageUrl(m.url, { width: 600 })} alt={m.alt || `Media ${i+1}`} className="w-full h-full object-contain rounded" />
                </AspectRatio>
              )}
              {m.type === 'audio' && <audio controls className="w-full" src={m.url} />}
              {m.type === 'video' && (
                <AspectRatio ratio={16/9}>
                  <video controls className="w-full h-full rounded" src={m.url} />
                </AspectRatio>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Options/Answer Section */}
      {item.mode === 'options' && item.options && item.options.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-3xl mx-auto">
          {item.options.map((option, index) => {
            const isCorrect = index === item.correctIndex;
            const optMedia = item.optionMedia?.[index];

            return (
              <div
                key={index}
                className={cn(
                  "relative min-h-12 p-4 rounded-2xl text-lg font-semibold border-2",
                  isCorrect 
                    ? "bg-green-50 dark:bg-green-950 border-green-500 ring-2 ring-green-500" 
                    : "bg-card border-border"
                )}
              >
                {/* Option media */}
                {optMedia && (
                  <div className="mb-3">
                    {optMedia.type === 'image' && (
                      <AspectRatio ratio={16 / 9}>
                        <img
                          src={getOptimizedImageUrl(optMedia.url, { width: 400, quality: 85 })}
                          alt={optMedia.alt || `Option ${index + 1} image`}
                          className={cn("w-full h-full rounded-lg", (() => {
                            const m:any = optMedia;
                            const desired = 16/9;
                            const w = typeof m?.width === 'number' ? m.width : undefined;
                            const h = typeof m?.height === 'number' ? m.height : undefined;
                            const ratio = w && h ? w / h : undefined;
                            const auto = ratio ? (Math.abs(ratio - desired) > 0.12 ? 'contain' : 'cover') : 'cover';
                            const fit = m?.fitMode || auto;
                            return fit === 'contain' ? 'object-contain bg-black/5' : 'object-cover';
                          })())}
                        />
                      </AspectRatio>
                    )}
                    {optMedia.type === 'audio' && (
                      <audio controls className="w-full" src={optMedia.url} />
                    )}
                    {optMedia.type === 'video' && (
                      <AspectRatio ratio={16 / 9}>
                        <video controls className="w-full h-full rounded" src={optMedia.url} />
                      </AspectRatio>
                    )}
                  </div>
                )}

                {/* Option text */}
                <div className="flex items-start gap-2">
                  <Badge variant={isCorrect ? "default" : "outline"} className="flex-shrink-0">
                    {String.fromCharCode(65 + index)}
                  </Badge>
                  <span className={cn(
                    "flex-1",
                    isCorrect && "font-bold text-green-700 dark:text-green-300"
                  )}>
                    {option}
                  </span>
                </div>

                {/* Correct indicator */}
                {isCorrect && (
                  <div className="absolute top-2 right-2">
                    <Badge variant="default" className="bg-green-600">
                      ✓ Correct
                    </Badge>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {item.mode === 'numeric' && (
        <Card className="p-4 text-center max-w-md mx-auto">
          <p className="text-sm text-muted-foreground mb-2">Numeric Answer Mode</p>
          <p className="text-2xl font-bold text-green-600">
            Answer: {item.answer ?? 'Not set'}
          </p>
        </Card>
      )}

      {/* Explanation */}
      {item.explain && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">
            Explanation:
          </p>
          <p className="text-sm text-blue-900 dark:text-blue-100 leading-relaxed">
            {item.explain}
          </p>
        </Card>
      )}

      {/* Hint */}
      {item.hint && (
        <Card className="p-3 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">
            Hint:
          </p>
          <p className="text-sm text-amber-900 dark:text-amber-100">
            {item.hint}
          </p>
        </Card>
      )}

      {/* Metadata footer */}
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        <Badge variant="outline" className="text-xs">
          Mode: {item.mode}
        </Badge>
        {item.clusterId && (
          <Badge variant="outline" className="text-xs">
            Cluster: {item.clusterId}
          </Badge>
        )}
        {item.variant && (
          <Badge variant="outline" className="text-xs">
            Variant: {item.variant}
          </Badge>
        )}
        <Badge variant="outline" className="text-xs">
          Group: {item.groupId}
        </Badge>
      </div>
    </div>
  );
};
