import { AspectRatio } from "@/components/ui/aspect-ratio";
import { cn } from "@/lib/utils";
import { ActionCornerButtons } from "./ActionCornerButtons";
import { EditableRichText } from "./EditableRichText";

interface WysiwygStemCardProps {
  stemHtml: string;
  mediaUrl?: string | null;
  mediaAlt?: string | null;
  onChangeStemHtml: (html: string) => void;
  onAiRewrite: () => void;
  onAiImage: () => void;
  onUploadMedia: () => void;
  cta: {
    edit: string;
    aiRewrite: string;
    aiImage: string;
    uploadMedia: string;
  };
  className?: string;
}

export function WysiwygStemCard({
  stemHtml,
  mediaUrl,
  mediaAlt,
  onChangeStemHtml,
  onAiRewrite,
  onAiImage,
  onUploadMedia,
  cta,
  className,
}: WysiwygStemCardProps) {
  return (
    <div className={cn("w-full max-w-3xl relative", className)}>
      <div className="flex gap-6 items-center min-h-[15vh] max-h-[180px] bg-muted/10 rounded-2xl p-5 border-2 border-border">
        <div className="flex-shrink-0">
          <div className="relative" style={{ width: 160, maxWidth: 160 }}>
            <AspectRatio
              ratio={16 / 9}
              className="bg-muted rounded-lg overflow-hidden border border-border flex items-center justify-center"
            >
              {mediaUrl ? (
                <img src={mediaUrl} alt={mediaAlt || ""} className="w-full h-full object-contain" />
              ) : (
                <div className="text-muted-foreground text-xs">No media</div>
              )}
            </AspectRatio>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <EditableRichText
            html={stemHtml}
            onChangeHtml={onChangeStemHtml}
            className="text-lg md:text-xl font-semibold leading-snug text-foreground outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-4 rounded"
            dataCtaId={cta.edit}
            dataAction="edit"
            ariaLabel="Edit stem"
          />
        </div>
      </div>

      <ActionCornerButtons
        actions={[
          { ctaId: cta.aiRewrite, title: "AI rewrite", icon: "✨", onClick: onAiRewrite },
          { ctaId: cta.aiImage, title: "AI image", icon: "🎨", onClick: onAiImage },
          { ctaId: cta.uploadMedia, title: "Upload/replace media", icon: "🖼️", onClick: onUploadMedia },
        ]}
      />
    </div>
  );
}


