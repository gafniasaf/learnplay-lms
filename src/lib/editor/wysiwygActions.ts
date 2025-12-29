/* eslint-disable @typescript-eslint/no-explicit-any */
import { generateMedia } from "@/lib/api/aiRewrites";
import { sanitizeHtml } from "@/lib/utils/sanitizeHtml";
import { resolveVariant, type VariantLevel } from "@/lib/utils/variantResolution";

export type MediaAsset = {
  type: "image" | "audio" | "video";
  url: string;
  alt?: string;
  transcriptUrl?: string;
  captionsUrl?: string;
  placement?: "block" | "inline";
};

export function getStemHtml(item: any, level: VariantLevel): string {
  if (item?.stem?.variants) {
    return String(resolveVariant(item.stem.variants, level, level) || "");
  }
  return String(item?.stem?.text || item?.text || "");
}

export function setStemHtml(item: any, level: VariantLevel, html: string): any {
  const cleaned = sanitizeHtml(html);
  if (item?.stem?.variants) {
    return {
      ...item,
      stem: {
        ...item.stem,
        variants: {
          ...(item.stem?.variants || {}),
          [level]: cleaned,
        },
      },
    };
  }
  if (item?.stem) {
    return {
      ...item,
      stem: {
        ...(item.stem || {}),
        text: cleaned,
      },
    };
  }
  return { ...item, text: cleaned };
}

export function getOptionsHtml(item: any, level: VariantLevel): string[] {
  const raw = Array.isArray(item?.options) ? (item.options as any[]) : [];
  if (raw.length === 0) return [];
  if (typeof raw[0] === "string") return raw.map((s) => String(s || ""));
  if (raw[0]?.variants) return raw.map((o: any) => String(resolveVariant(o.variants, level, level) || ""));
  return raw.map((o: any) => String(o?.text ?? ""));
}

export function setOptionHtml(item: any, level: VariantLevel, index: number, html: string): any {
  const cleaned = sanitizeHtml(html);
  const raw = Array.isArray(item?.options) ? ([...item.options] as any[]) : [];
  if (!raw[index]) return item;
  if (typeof raw[index] === "string") {
    raw[index] = cleaned;
    return { ...item, options: raw };
  }
  if (raw[index]?.variants) {
    raw[index] = {
      ...raw[index],
      variants: {
        ...(raw[index].variants || {}),
        [level]: cleaned,
      },
    };
    return { ...item, options: raw };
  }
  raw[index] = { ...(raw[index] || {}), text: cleaned };
  return { ...item, options: raw };
}

export function getExplanationHtml(item: any, level: VariantLevel): string {
  if (item?.explanation?.variants) {
    return String(resolveVariant(item.explanation.variants, level, level) || "");
  }
  return String(item?.reference?.html || item?.referenceHtml || item?.explain || item?.explanation || item?.rationale || "");
}

export function setExplanationHtml(item: any, level: VariantLevel, html: string): any {
  const cleaned = sanitizeHtml(html);
  if (item?.explanation?.variants) {
    return {
      ...item,
      explanation: {
        ...(item.explanation || {}),
        variants: {
          ...(item.explanation?.variants || {}),
          [level]: cleaned,
        },
      },
    };
  }
  if (item?.reference) {
    return {
      ...item,
      reference: {
        ...(item.reference || {}),
        html: cleaned,
      },
    };
  }
  if (item?.referenceHtml !== undefined) {
    return { ...item, referenceHtml: cleaned };
  }
  if (item?.explain !== undefined) {
    return { ...item, explain: cleaned };
  }
  if (item?.explanation !== undefined) {
    return { ...item, explanation: cleaned };
  }
  if (item?.rationale !== undefined) {
    return { ...item, rationale: cleaned };
  }
  // Legacy: create 'explain' if no explanation field exists
  return { ...item, explain: cleaned };
}

function asMediaAsset(m: any): MediaAsset | null {
  if (!m) return null;
  const url = String(m.url || m.public_url || m.path || m.storagePath || m.key || "");
  const type = m.type as MediaAsset["type"] | undefined;
  if (!url || !type) return null;
  return {
    type,
    url,
    alt: m.alt,
    transcriptUrl: m.transcriptUrl,
    captionsUrl: m.captionsUrl,
    placement: m.placement,
  };
}

export function getStemPrimaryMedia(item: any, level: VariantLevel): MediaAsset | null {
  // vNext stem media variants
  if (item?.stem?.media?.variants) {
    const arr = resolveVariant(item.stem.media.variants, level, level) as any;
    if (Array.isArray(arr) && arr.length > 0) {
      return asMediaAsset(arr.find((x: any) => asMediaAsset(x))) || null;
    }
  }

  // New-ish editor arrays
  const stemArr = Array.isArray(item?.stem?.media) ? item.stem.media : null;
  if (Array.isArray(stemArr) && stemArr.length > 0) {
    return asMediaAsset(stemArr.find((x: any) => asMediaAsset(x))) || null;
  }

  const stim = item?.stimulus;
  // Legacy single stimulus object
  if (stim?.url && stim?.type) {
    return asMediaAsset(stim);
  }
  // Legacy array under stimulus.media
  if (Array.isArray(stim?.media) && stim.media.length > 0) {
    return asMediaAsset(stim.media.find((x: any) => asMediaAsset(x))) || null;
  }

  return null;
}

export function setStemPrimaryMedia(item: any, level: VariantLevel, media: MediaAsset): any {
  // vNext stem media variants
  if (item?.stem?.variants) {
    const existing = item?.stem?.media?.variants?.[level];
    const nextArr = Array.isArray(existing) && existing.length > 0 ? [media, ...existing.slice(1)] : [media];
    return {
      ...item,
      stem: {
        ...(item.stem || {}),
        media: {
          ...(item.stem?.media || {}),
          variants: {
            ...(item.stem?.media?.variants || {}),
            [level]: nextArr,
          },
        },
      },
    };
  }

  // New-ish: stem.media array
  if (Array.isArray(item?.stem?.media)) {
    const existing: any[] = item.stem.media;
    const nextArr = existing.length > 0 ? [media, ...existing.slice(1)] : [media];
    return { ...item, stem: { ...(item.stem || {}), media: nextArr } };
  }

  // Legacy: set stimulus as a single object for maximum compatibility
  return { ...item, stimulus: { ...media } };
}

export function getOptionPrimaryMedia(item: any, level: VariantLevel, index: number): MediaAsset | null {
  // vNext option objects with media variants
  const opt = Array.isArray(item?.options) ? item.options[index] : undefined;
  if (opt?.media?.variants) {
    const arr = resolveVariant(opt.media.variants, level, level) as any;
    if (Array.isArray(arr) && arr.length > 0) {
      return asMediaAsset(arr.find((x: any) => asMediaAsset(x))) || null;
    }
  }
  // legacy optionMedia array
  const om = Array.isArray(item?.optionMedia) ? item.optionMedia[index] : null;
  return asMediaAsset(om) || null;
}

export function setOptionPrimaryMedia(item: any, level: VariantLevel, index: number, media: MediaAsset | null): any {
  // vNext option objects with variants
  const opts = Array.isArray(item?.options) ? ([...item.options] as any[]) : null;
  if (opts && opts[index]?.variants) {
    const existing = opts[index]?.media?.variants?.[level];
    const nextArr = media ? (Array.isArray(existing) && existing.length > 0 ? [media, ...existing.slice(1)] : [media]) : [];
    opts[index] = {
      ...opts[index],
      media: {
        ...(opts[index].media || {}),
        variants: {
          ...(opts[index].media?.variants || {}),
          [level]: nextArr,
        },
      },
    };
    return { ...item, options: opts };
  }

  // legacy optionMedia array
  const existingOptionMedia = Array.isArray(item?.optionMedia) ? ([...item.optionMedia] as any[]) : [];
  existingOptionMedia[index] = media ? { ...media } : null;
  return { ...item, optionMedia: existingOptionMedia };
}

export function escapeHtmlAttr(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function generateStemImage(args: { course: any; item: any }): Promise<{ url: string; alt?: string }> {
  const { course, item } = args;
  const subj = (course as any)?.subject || course?.title || "General";
  const stem = String((item as any)?.stem?.text || (item as any)?.text || "");
  const stemPlain = stem.replace(/<[^>]*>/g, "").replace(/\[blank\]/gi, "___").slice(0, 160);
  const allOptions = Array.isArray((item as any)?.options)
    ? ((item as any).options as any[])
        .slice(0, 4)
        .map((o: any) => (typeof o === "string" ? o : o?.text || ""))
        .filter(Boolean)
    : [];
  const optionsContext = allOptions.length > 0 ? `Answer choices include: ${allOptions.join(", ")}.` : "";

  const prompt = [
    `Simple learning visual for ${subj}.`,
    `Question context: ${stemPlain}`,
    optionsContext,
    `Create a clean photo or realistic illustration that helps students understand this concept.`,
    `IMPORTANT: Absolutely no text, letters, words, labels, numbers, or written language anywhere in the image.`,
    `No diagrams, charts, or infographics. Just a clean visual representation.`,
    `Original artwork only - no copyrighted characters or brands.`,
    `Colorful, friendly, child-appropriate educational style.`,
  ]
    .filter(Boolean)
    .join(" ");

  const res = await generateMedia({
    prompt,
    kind: "image",
    options: { aspectRatio: "16:9", size: "1024x1024", quality: "standard" },
  });

  return { url: res.url, alt: res.alt };
}

export async function generateOptionImage(args: {
  course: any;
  item: any;
  optionText: string;
  index: number;
}): Promise<{ url: string; alt?: string }> {
  const { course, item, optionText, index } = args;
  const subj = (course as any)?.subject || course?.title || "General";
  const stem = String((item as any)?.stem?.text || (item as any)?.text || "");
  const stemPlain = stem.replace(/<[^>]*>/g, "").replace(/\[blank\]/gi, "___").slice(0, 100);
  const optionPlain = String(optionText).replace(/<[^>]*>/g, "").replace(/\[blank\]/gi, "___").slice(0, 120);

  const prompt = [
    `Simple learning visual for ${subj}.`,
    `Question context: ${stemPlain}`,
    `This option represents: ${optionPlain}`,
    `Create a clean photo or realistic illustration that visually represents this option/answer choice.`,
    `IMPORTANT: Absolutely no text, letters, words, labels, numbers, or written language anywhere in the image.`,
    `No diagrams, charts, or infographics. Just a clean visual representation of the concept.`,
    `Original artwork only - no copyrighted characters or brands.`,
    `Colorful, friendly, child-appropriate educational style.`,
    `Square aspect ratio (1:1) suitable for an option tile.`,
  ]
    .filter(Boolean)
    .join(" ");

  const res = await generateMedia({
    prompt,
    kind: "image",
    options: { aspectRatio: "1:1", size: "1024x1024", quality: "standard" },
  });

  return { url: res.url, alt: res.alt || `Option ${index + 1} image` };
}


