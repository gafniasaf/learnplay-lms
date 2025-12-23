import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function TileImage(props: {
  optimizedSrc: string;
  alt: string;
  badge: string;
  fitClass: string;
  loading: boolean;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onError?: () => void;
}) {
  const { optimizedSrc, alt, badge, fitClass, loading, onLoad, onError } = props;
  return (
    <>
      {loading && <div className="absolute inset-0 bg-muted animate-pulse" />}
      <img
        src={optimizedSrc}
        alt={alt}
        className={cn("absolute inset-0 w-full h-full", fitClass, loading && "opacity-0")}
        loading="lazy"
        decoding="async"
        onLoad={onLoad}
        onError={onError}
      />
      <Badge className="absolute bottom-2 left-2 bg-black/70 text-white border-0">{badge}</Badge>
    </>
  );
}

export function TileVideo(props: {
  sources: string[];
  badge: string;
  fitClass: string;
  loading: boolean;
  onLoadedMetadata?: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onError?: () => void;
  captionsUrl?: string;
}) {
  const { sources, badge, fitClass, loading, onLoadedMetadata, onError, captionsUrl } = props;
  return (
    <div className="absolute inset-0" onClick={(e) => e.stopPropagation()}>
      {loading && <div className="absolute inset-0 bg-muted animate-pulse" />}
      <video
        controls
        preload="metadata"
        className={cn("absolute inset-0 w-full h-full", fitClass, loading && "opacity-0")}
        onLoadedMetadata={onLoadedMetadata}
        onError={onError}
        aria-label={`Video option`}
      >
        {sources.map((s, i) => (
          <source key={i} src={s} />
        ))}
        {captionsUrl && (
          <track kind="captions" src={captionsUrl} srcLang="en" label="English" default />
        )}
        Your browser does not support the video element.
      </video>
      <Badge className="absolute bottom-2 left-2 bg-black/70 text-white border-0">{badge}</Badge>
    </div>
  );
}

export function TileAudio(props: {
  src: string;
  transcriptOpen: boolean;
  badge: string;
  onToggleTranscript: () => void;
  onLoadedMetadata?: () => void;
  onError?: () => void;
  audioHeight: number;
  transcriptText?: string | null;
  transcriptLoading?: boolean;
}) {
  const { src, transcriptOpen, badge, onToggleTranscript, onLoadedMetadata, onError, audioHeight, transcriptText, transcriptLoading } = props;
  return (
    <div className="w-full p-4">
      <div className="relative">
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <audio
            controls
            preload="metadata"
            className="w-full"
            style={{ height: audioHeight }}
            onLoadedMetadata={onLoadedMetadata}
            onError={onError}
          >
            <source src={src} />
            Your browser does not support the audio element.
          </audio>
          <button className="text-xs underline" type="button" onClick={onToggleTranscript}>
            {transcriptOpen ? 'Hide Transcript' : 'Show Transcript'}
          </button>
          {transcriptOpen && (
            <div className="mt-1 p-2 bg-muted/30 rounded text-xs leading-relaxed text-left">
              {transcriptLoading ? <p className="italic">Loading...</p> : transcriptText ? <p className="whitespace-pre-wrap">{transcriptText}</p> : null}
            </div>
          )}
        </div>
      </div>
      <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground">{badge}</Badge>
    </div>
  );
}
