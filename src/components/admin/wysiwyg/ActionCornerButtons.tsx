import { cn } from "@/lib/utils";

export interface CornerAction {
  ctaId: string;
  title: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  buttonClassName?: string;
}

interface ActionCornerButtonsProps {
  actions: CornerAction[];
  className?: string;
}

export function ActionCornerButtons({ actions, className }: ActionCornerButtonsProps) {
  return (
    <div className={cn("absolute bottom-3 right-3 flex items-center gap-1", className)}>
      {actions.map((a) => (
        <button
          key={a.ctaId}
          type="button"
          title={a.title}
          onClick={a.onClick}
          disabled={a.disabled}
          className={cn(
            "w-8 h-8 rounded-md border border-border bg-background/90 backdrop-blur-sm shadow-sm",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            a.buttonClassName
          )}
          data-cta-id={a.ctaId}
          data-action="action"
        >
          {a.icon}
        </button>
      ))}
    </div>
  );
}


