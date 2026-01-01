import { BlobReader, TextWriter, ZipReader } from "https://deno.land/x/zipjs@v2.7.34/index.js";

export interface ParsedText {
  text: string;
  wordCount: number;
}

export async function extractText(bytes: Uint8Array, mimeType: string, fileName: string): Promise<string> {
  const name = (fileName || "").toLowerCase();
  const type = (mimeType || "").toLowerCase();

  // Text-like types
  if (
    type.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    name.endsWith(".html") ||
    name.endsWith(".htm")
  ) {
    const text = new TextDecoder().decode(bytes);
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Empty text file");
    return trimmed;
  }

  // PDF (best-effort; FAIL if we can't extract meaningful text)
  if (type === "application/pdf" || name.endsWith(".pdf")) {
    return await extractPdfText(bytes);
  }

  // DOCX
  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return await extractDocxText(bytes);
  }

  // PPTX
  if (
    type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    name.endsWith(".pptx")
  ) {
    return await extractPptxText(bytes);
  }

  // ZIP (extract .txt files)
  if (type === "application/zip" || name.endsWith(".zip")) {
    return await extractZipText(bytes);
  }

  throw new Error(`Unsupported file type: ${mimeType || fileName}`);
}

export function parseText(text: string): ParsedText {
  const cleaned = String(text ?? "").replace(/\s+/g, " ").trim();
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
  return { text: cleaned, wordCount: words.length };
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // Best-effort: parse BT/ET segments and extract strings.
  // IMPORTANT: Do NOT return placeholders. If extraction yields nothing, FAIL LOUD.
  const decoded = new TextDecoder().decode(bytes);
  const textParts: string[] = [];

  const btPattern = /BT\s+(.*?)\s+ET/gs;
  let match: RegExpExecArray | null;

  while ((match = btPattern.exec(decoded)) !== null) {
    const content = match[1];
    const stringPattern = /\((.*?)\)|<(.*?)>/g;
    let strMatch: RegExpExecArray | null;
    while ((strMatch = stringPattern.exec(content)) !== null) {
      const str = strMatch[1] || strMatch[2];
      if (str) textParts.push(str);
    }
  }

  const merged = textParts.join(" ").replace(/\s+/g, " ").trim();
  if (!merged) {
    throw new Error("PDF text extraction failed (no extractable text found). Convert to DOCX/TXT or provide OCR text.");
  }
  return merged;
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  try {
    const blob = new Blob([bytes.buffer as ArrayBuffer]);
    const reader = new BlobReader(blob);
    const zipReader = new ZipReader(reader);
    const entries = await zipReader.getEntries();

    const documentEntry = entries.find((entry) => entry.filename === "word/document.xml");
    if (!documentEntry || !documentEntry.getData) {
      throw new Error("Invalid DOCX file: missing word/document.xml");
    }

    const writer = new TextWriter();
    const xmlText = await documentEntry.getData(writer);
    await zipReader.close();

    const textMatches = xmlText.match(/<w:t[^>]*>(.*?)<\/w:t>/g) || [];
    const textParts = textMatches.map((match: string) => {
      const content = match.replace(/<w:t[^>]*>|<\/w:t>/g, "");
      return decodeXmlEntities(content);
    });

    const merged = textParts.join(" ").replace(/\s+/g, " ").trim();
    if (!merged) throw new Error("DOCX extraction produced empty text");
    return merged;
  } catch (error) {
    console.error("DOCX extraction error:", error);
    throw new Error("Failed to extract text from DOCX file");
  }
}

async function extractPptxText(bytes: Uint8Array): Promise<string> {
  try {
    const blob = new Blob([bytes.buffer as ArrayBuffer]);
    const reader = new BlobReader(blob);
    const zipReader = new ZipReader(reader);
    const entries = await zipReader.getEntries();

    const textParts: string[] = [];

    for (const entry of entries) {
      if (entry.filename.startsWith("ppt/slides/slide") && entry.filename.endsWith(".xml") && entry.getData) {
        const writer = new TextWriter();
        const xmlText = await entry.getData(writer);

        const matches = xmlText.match(/<a:t[^>]*>(.*?)<\/a:t>/g) || [];
        const slideParts = matches.map((match: string) => {
          const content = match.replace(/<a:t[^>]*>|<\/a:t>/g, "");
          return decodeXmlEntities(content);
        });

        textParts.push(...slideParts);
      }
    }

    await zipReader.close();
    const merged = textParts.join(" ").replace(/\s+/g, " ").trim();
    if (!merged) throw new Error("PPTX extraction produced empty text");
    return merged;
  } catch (error) {
    console.error("PPTX extraction error:", error);
    throw new Error("Failed to extract text from PPTX file");
  }
}

async function extractZipText(bytes: Uint8Array): Promise<string> {
  try {
    const blob = new Blob([bytes.buffer as ArrayBuffer]);
    const reader = new BlobReader(blob);
    const zipReader = new ZipReader(reader);
    const entries = await zipReader.getEntries();

    const textParts: string[] = [];

    for (const entry of entries) {
      if (entry.filename.endsWith(".txt") && entry.getData) {
        const writer = new TextWriter();
        const text = await entry.getData(writer);
        if (typeof text === "string" && text.trim()) textParts.push(text.trim());
      }
    }

    await zipReader.close();
    const merged = textParts.join("\n\n").replace(/\s+/g, " ").trim();
    if (!merged) throw new Error("ZIP extraction found no .txt entries with text");
    return merged;
  } catch (error) {
    console.error("ZIP extraction error:", error);
    throw new Error("Failed to extract text from ZIP file");
  }
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function chunkText(text: string, minSize: number, maxSize: number, overlap: number): string[] {
  const cleaned = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    let end = Math.min(start + maxSize, cleaned.length);

    if (end < cleaned.length) {
      const searchStart = Math.max(start + minSize, end - 400);
      const segment = cleaned.substring(searchStart, end);
      const sentenceEnd = segment.lastIndexOf(". ");
      if (sentenceEnd !== -1) {
        end = searchStart + sentenceEnd + 1;
      } else {
        const spaceIndex = segment.lastIndexOf(" ");
        if (spaceIndex !== -1) {
          end = searchStart + spaceIndex;
        }
      }
    }

    const chunk = cleaned.substring(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);

    start = end - overlap;
    if (start <= chunks[chunks.length - 1]?.length || start >= cleaned.length) {
      start = end;
    }
  }

  return chunks;
}



