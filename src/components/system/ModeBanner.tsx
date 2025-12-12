import { isLiveMode } from "@/lib/env";
import { isDevAgentMode } from "@/lib/api/common";

const SHOW_MODE_BANNER = import.meta.env.VITE_SHOW_MODE_BANNER === "true";

function modeLabel(): { label: string; detail?: string; variant: "info" | "warn" } | null {
  const live = isLiveMode();
  const devAgent = isDevAgentMode();

  // Highest signal banners first
  if (!live) {
    return { label: "MOCK MODE", detail: "Using mocks/fallbacks (not fully live)", variant: "warn" };
  }
  if (devAgent) {
    return { label: "DEV AGENT MODE", detail: "Using agent-token auth (explicit)", variant: "warn" };
  }
  return null;
}

export function ModeBanner() {
  if (typeof window === "undefined") return null;
  if (!SHOW_MODE_BANNER) return null;
  const m = modeLabel();
  if (!m) return null;

  const cls =
    m.variant === "warn"
      ? "w-full bg-amber-100 text-amber-900 text-sm px-3 py-2 text-center"
      : "w-full bg-blue-50 text-blue-900 text-sm px-3 py-2 text-center";

  return (
    <div data-testid="mode-banner" className={cls}>
      <strong>{m.label}</strong>
      {m.detail ? <span className="ml-2 opacity-80">{m.detail}</span> : null}
    </div>
  );
}


