/**
 * Shared utilities for AI course generation
 */

/** Escape special regex characters in a string */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalize options-mode item to have exactly one [blank] placeholder
 * Throws error if unable to enforce exactly one placeholder
 */
export function normalizeOptionsItem(item: any): any {
  if (item.mode !== 'options') return item;
  
  let t = (item.text || '').trim();
  
  // Step 1: Convert underscore runs (2+) to [blank]
  t = t.replace(/_{2,}/g, '[blank]');
  
  // Step 2: Convert single underscores to [blank]
  t = t.replace(/_/g, '[blank]');
  
  // Step 3: Collapse multiple [blank]s to exactly one using marker approach
  const blankMatches = t.match(/\[blank\]/g) || [];
  if (blankMatches.length > 1) {
    // Replace first [blank] with temporary marker
    t = t.replace(/\[blank\]/, '___ONE___');
    // Remove all other [blank]s
    t = t.replace(/\[blank\]/g, '');
    // Restore the single [blank]
    t = t.replace('___ONE___', '[blank]');
  }
  
  // Step 4: If no [blank] exists, insert it strategically
  if (!/\[blank\]/.test(t)) {
    const ans = item.options?.[item.correctIndex] || '';
    
    // Try to insert before the correct answer token if present
    if (ans) {
      const escapedAns = escapeRegex(ans);
      const ansRegex = new RegExp(`\\b${escapedAns}\\b`);
      if (ansRegex.test(t)) {
        t = t.replace(ansRegex, '[blank]');
      } else {
        // Insert in the middle of the text
        const words = t.split(/\s+/).filter((w: string) => w.length > 0);
        const middleIndex = Math.floor(words.length / 2);
        if (words.length > 0) {
          words.splice(middleIndex, 0, '[blank]');
          t = words.join(' ');
        } else {
          t = '[blank]';
        }
      }
    } else {
      // No answer available, insert in middle
      const words = t.split(/\s+/).filter((w: string) => w.length > 0);
      const middleIndex = Math.floor(words.length / 2);
      if (words.length > 0) {
        words.splice(middleIndex, 0, '[blank]');
        t = words.join(' ');
      } else {
        t = '[blank]';
      }
    }
  }
  
  // Step 5: Final validation - enforce exactly one [blank]
  const finalMatches = t.match(/\[blank\]/g) || [];
  if (finalMatches.length !== 1) {
    throw new Error('invalid_placeholder_count');
  }
  
  // Update item text
  item.text = t;
  return item;
}

/**
 * Normalize numeric-mode item to have exactly one [blank] placeholder and no options
 */
export function normalizeNumericItem(item: any): any {
  if (item.mode !== 'numeric') return item;
  let t = (item.text || '').trim();

  // Remove any options fields for numeric mode
  if ('options' in item) delete item.options;
  if ('correctIndex' in item) delete item.correctIndex;

  // Replace underscores with [blank]
  t = t.replace(/_{2,}/g, '[blank]');
  t = t.replace(/_/g, '[blank]');

  // Collapse multiple [blank]
  const blanks = t.match(/\[blank\]/g) || [];
  if (blanks.length > 1) {
    t = t.replace(/\[blank\]/, '___ONE___');
    t = t.replace(/\[blank\]/g, '');
    t = t.replace('___ONE___', '[blank]');
  }

  if (!/\[blank\]/.test(t)) {
    // Insert [blank] near equals sign if present
    if (/=\s*\??\s*$/.test(t)) {
      t = t.replace(/=\s*\??\s*$/, '= [blank]');
    } else if (/=/.test(t)) {
      t = t.replace(/=.*/, '= [blank]');
    } else {
      // Fallback: insert in the middle
      const words = t.split(/\s+/).filter((w: string) => w.length > 0);
      const middleIndex = Math.floor(words.length / 2);
      if (words.length > 0) {
        words.splice(middleIndex, 0, '[blank]');
        t = words.join(' ');
      } else {
        t = '[blank]';
      }
    }
  }

  const finalMatches = t.match(/\[blank\]/g) || [];
  if (finalMatches.length !== 1) {
    throw new Error('invalid_placeholder_count');
  }
  item.text = t;
  return item;
}

/**
 * Count placeholders in text (_ or [blank]) - for legacy compatibility
 */
export function countPlaceholders(text: string): number {
  const underscoreCount = (text.match(/_/g) || []).length;
  const blankCount = (text.match(/\[blank\]/g) || []).length;
  return underscoreCount + blankCount;
}

/**
 * Extract JSON object/array from text that may include markdown fences, comments, or extra text.
 * Attempts several repair strategies.
 */
export function extractJsonFromText(text: string): any {
  if (!text || typeof text !== 'string') throw new Error('empty');
  let s = text.trim();

  // Normalize smart quotes and odd whitespace
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\u00A0/g, ' ');

  // Fast signal for truncated JSON (common when model output is cut off mid-stream)
  // We deliberately do NOT attempt to "repair" by auto-closing braces, because that can fabricate data.
  if (s.startsWith('{') && !s.includes('}')) throw new Error('truncated_json_object');
  if (s.startsWith('[') && !s.includes(']')) throw new Error('truncated_json_array');

  // Prefer <json>...</json>
  const tagMatch = s.match(/<json>\s*([\s\S]*?)\s*<\/json>/i);
  if (tagMatch && tagMatch[1]) {
    const inner = tagMatch[1].trim();
    try { return JSON.parse(inner); } catch (_) { /* continue */ }
  }

  // Prefer fenced blocks ```json ... ``` or ``` ... ```
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    const fenced = fenceMatch[1].trim();
    // Try direct parse
    try { return JSON.parse(fenced); } catch (_) { /* continue */ }
    // Try basic repairs: remove comments and trailing commas
    const repaired = fenced
      .replace(/\s*\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/,\s*(\}|\])/g, '$1');
    try { return JSON.parse(repaired); } catch (_) { /* continue */ }
  }

  // If it starts with JSON, try directly (and a repaired attempt)
  if ((s.startsWith('{') && s.includes('}')) || (s.startsWith('[') && s.includes(']'))) {
    try { return JSON.parse(s); } catch (_) {
      const repaired = s
        .replace(/\s*\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/,\s*(\}|\])/g, '$1');
      try { return JSON.parse(repaired); } catch (_) { /* continue */ }
    }
  }

  // Balanced region extraction for object/array
  function extractBalanced(input: string, openChar: '{'|'[', closeChar: '}'|']', startIndex = 0): { text: string, end: number } | null {
    let start = input.indexOf(openChar, startIndex);
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let esc = false;
    for (let i = start; i < input.length; i++) {
      const ch = input[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === openChar) depth++;
      else if (ch === closeChar) {
        depth--;
        if (depth === 0) {
          return { text: input.slice(start, i + 1), end: i + 1 };
        }
      }
    }
    return null;
  }

  const objRegion = extractBalanced(s, '{', '}');
  if (objRegion) {
    // Attempt parse with basic repairs
    try { return JSON.parse(objRegion.text); } catch (_) {
      const repaired = objRegion.text.replace(/,\s*(\}|\])/g, '$1');
      try { return JSON.parse(repaired); } catch (_) { /* continue */ }
    }
  }

  const arrRegion = extractBalanced(s, '[', ']');
  if (arrRegion) {
    try { return JSON.parse(arrRegion.text); } catch (_) {
      const repaired = arrRegion.text.replace(/,\s*(\}|\])/g, '$1');
      try { return JSON.parse(repaired); } catch (_) { /* continue */ }
    }
  }

  // Special repair: reconstruct object if LLM emitted top-level keys without braces
  // e.g. \n  "studyTexts": [...],\n  "items": [...]
  const hasStudyTexts = /\"studyTexts\"\s*:\s*\[/i.test(s);
  const hasItems = /\"items\"\s*:\s*\[/i.test(s);
  if (hasStudyTexts && hasItems) {
    // Extract the array regions following each key using balanced bracket parsing
    function extractArrayAfterKey(input: string, key: string): string | null {
      const keyIdx = input.search(new RegExp(`\\"${key}\\"\\s*:\\s*\\[`, 'i'));
      if (keyIdx === -1) return null;
      const bracketStart = input.indexOf('[', keyIdx);
      const region = extractBalanced(input, '[', ']', bracketStart);
      return region?.text || null;
    }
    const stArr = extractArrayAfterKey(s, 'studyTexts');
    const itArr = extractArrayAfterKey(s, 'items');
    if (stArr && itArr) {
      const reconstructed = `{\n  "studyTexts": ${stArr},\n  "items": ${itArr}\n}`;
      try { return JSON.parse(reconstructed); } catch (_) { /* continue */ }
    }
  }

  throw new Error('invalid_json');
}
