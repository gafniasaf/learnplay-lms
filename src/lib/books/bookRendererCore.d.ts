export function applyRewritesOverlay(canonical: any, overlay: any): any;
export function escapeHtml(s: any): string;
export function sanitizeInlineBookHtml(raw: any): string;

export function renderBookHtml(
  canonical: any,
  opts?: {
    target?: "book" | "chapter";
    chapterIndex?: number;
    assetsBaseUrl?: string;
    figures?: { srcMap?: Record<string, string>; src_map?: Record<string, string> } | null;
    designTokens?: any;
    chapterOpeners?: Record<string | number, string> | null;
    placeholdersOnly?: boolean;
    coverUrl?: string | null;
  },
): string;


