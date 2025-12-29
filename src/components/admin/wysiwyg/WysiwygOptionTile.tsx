import { cn } from "@/lib/utils";
import { ActionCornerButtons } from "./ActionCornerButtons";
import { EditableRichText } from "./EditableRichText";

interface WysiwygOptionTileProps {
  index: number;
  optionHtml: string;
  mediaUrl?: string | null;
  mediaAlt?: string | null;
  isCorrect: boolean;
  onSetCorrect: () => void;
  onChangeOptionHtml: (html: string) => void;
  onAiRewrite: () => void;
  onAiImage: () => void;
  onUploadMedia: () => void;
  cta: {
    edit: string;
    aiRewrite: string;
    aiImage: string;
    uploadMedia: string;
    setCorrect: string;
  };
}

export function WysiwygOptionTile({
  index,
  optionHtml,
  mediaUrl,
  mediaAlt,
  isCorrect,
  onSetCorrect,
  onChangeOptionHtml,
  onAiRewrite,
  onAiImage,
  onUploadMedia,
  cta,
}: WysiwygOptionTileProps) {
  const hasMedia = !!mediaUrl;
  const letter = String.fromCharCode(65 + index);

  return (
    <div className="w-full relative" style={{ aspectRatio: "16 / 9" }}>
      <div
        className={cn(
          "group absolute inset-0 rounded-2xl transition-all overflow-hidden",
          "border-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-4",
          isCorrect ? "border-green-500 bg-green-50/30" : "bg-card border-border hover:border-primary"
        )}
      >
        {hasMedia ? (
          <img src={mediaUrl || ""} alt={mediaAlt || ""} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">No media</div>
        )}

        <div className={cn("absolute inset-0", hasMedia ? "bg-gradient-to-t from-black/60 via-black/10 to-transparent" : "")} />

        <div className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm text-xs font-semibold px-2 py-0.5 rounded border">
          {letter}
        </div>
        {isCorrect && (
          <div className="absolute top-2 right-2 bg-green-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">
            ✓
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-3">
          <EditableRichText
            html={optionHtml}
            onChangeHtml={onChangeOptionHtml}
            className={cn(
              "outline-none rounded",
              hasMedia ? "text-white font-semibold text-sm drop-shadow" : "text-foreground font-semibold text-sm"
            )}
            dataCtaId={cta.edit}
            dataAction="edit"
            ariaLabel={`Edit option ${letter}`}
          />
        </div>
      </div>

      <ActionCornerButtons
        className="bottom-2 right-2"
        actions={[
          { ctaId: cta.aiRewrite, title: "AI rewrite", icon: "✨", onClick: onAiRewrite },
          { ctaId: cta.aiImage, title: "AI image", icon: "🎨", onClick: onAiImage },
          { ctaId: cta.uploadMedia, title: hasMedia ? "Replace media" : "Add media", icon: "🖼️", onClick: onUploadMedia },
          {
            ctaId: cta.setCorrect,
            title: isCorrect ? "Correct answer" : "Mark correct",
            icon: "✓",
            onClick: onSetCorrect,
            buttonClassName: isCorrect ? "text-green-700" : undefined,
          },
        ]}
      />
    </div>
  );
}


