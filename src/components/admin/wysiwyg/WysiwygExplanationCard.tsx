import { cn } from "@/lib/utils";
import { ActionCornerButtons } from "./ActionCornerButtons";
import { EditableRichText } from "./EditableRichText";

interface WysiwygExplanationCardProps {
  html: string;
  onChangeHtml: (html: string) => void;
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

export function WysiwygExplanationCard({
  html,
  onChangeHtml,
  onAiRewrite,
  onAiImage,
  onUploadMedia,
  cta,
  className,
}: WysiwygExplanationCardProps) {
  return (
    <div className={cn("w-full max-w-3xl relative", className)}>
      <div className="bg-card rounded-2xl p-5 shadow-sm border-l-4 border-green-500">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-green-600">Explanation</div>
        </div>
        <EditableRichText
          html={html || "<p></p>"}
          onChangeHtml={onChangeHtml}
          className="text-sm leading-relaxed text-foreground outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-4 rounded"
          dataCtaId={cta.edit}
          dataAction="edit"
          ariaLabel="Edit explanation"
        />
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


