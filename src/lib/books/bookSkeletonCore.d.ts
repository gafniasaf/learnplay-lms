export type SkeletonSeverity = "error" | "warning";

export type SkeletonIssue = {
  severity: SkeletonSeverity;
  code: string;
  message: string;
  path: string[];
};

export type SkeletonMeta = {
  bookId: string;
  bookVersionId: string;
  title: string;
  level: "n3" | "n4";
  language: string;
  schemaVersion: "skeleton_v1";
  promptPackId?: string;
  promptPackVersion?: number;
};

export type SkeletonImage = {
  src: string;
  alt?: string | null;
  caption?: string | null;
  figureNumber?: string | null;
  layoutHint?: string | null;
  /**
   * Optional LLM suggestion used later for AI image generation or manual briefing.
   * Authoring-only metadata (must not affect deterministic canonical compilation).
   */
  suggestedPrompt?: string | null;
};

export type SkeletonParagraphBlock = {
  type: "paragraph";
  id: string;
  basisHtml: string;
  praktijkHtml?: string | null;
  verdiepingHtml?: string | null;
  images?: SkeletonImage[] | null;
};

export type SkeletonListBlock = {
  type: "list";
  id: string;
  ordered?: boolean | null;
  items: string[];
  images?: SkeletonImage[] | null;
};

export type SkeletonStepsBlock = {
  type: "steps";
  id: string;
  items: string[];
  images?: SkeletonImage[] | null;
};

export type SkeletonSubparagraphBlock = {
  type: "subparagraph";
  id?: string | null;
  title: string;
  blocks: SkeletonBlock[];
};

export type SkeletonBlock = SkeletonParagraphBlock | SkeletonListBlock | SkeletonStepsBlock | SkeletonSubparagraphBlock;

export type SkeletonSection = {
  id: string;
  title: string;
  blocks: SkeletonBlock[];
};

export type SkeletonChapter = {
  id: string;
  number: number;
  title: string;
  openerImageSrc?: string | null;
  sections: SkeletonSection[];
};

export type BookSkeletonV1 = {
  meta: SkeletonMeta;
  styleProfile?: Record<string, unknown> | null;
  chapters: SkeletonChapter[];
};

export function validateBookSkeleton(
  raw: unknown
): { ok: true; skeleton: BookSkeletonV1; issues: SkeletonIssue[] } | { ok: false; issues: SkeletonIssue[] };

export function compileSkeletonToCanonical(sk: BookSkeletonV1): any;

export function canonicalToSkeleton(
  canonical: any,
  opts?: { bookId?: string; bookVersionId?: string; promptPackId?: string; promptPackVersion?: number }
): BookSkeletonV1;


