/**
 * Enrichment Guardrails Module (Phase 5)
 * Provides similarity computation and guardrail checking for content enrichment
 */

/**
 * Compute Jaccard similarity between two text strings using keyword-based comparison
 * @param original - Original text content
 * @param enriched - Enriched text content
 * @returns Similarity score between 0.0 and 1.0
 */
export function computeSimilarity(original: string, enriched: string): number {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
    'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'can',
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
    'this', 'that', 'these', 'those', 'it', 'its', 'they', 'their'
  ]);

  const tokenize = (text: string): Set<string> => {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopwords.has(w));
    return new Set(words);
  };

  const origSet = tokenize(original);
  const enrichSet = tokenize(enriched);

  if (origSet.size === 0 && enrichSet.size === 0) return 1.0;
  if (origSet.size === 0 || enrichSet.size === 0) return 0.0;

  const intersection = new Set([...origSet].filter(w => enrichSet.has(w)));
  const union = new Set([...origSet, ...enrichSet]);

  return intersection.size / union.size;
}

/**
 * Enrichment result with guardrail metrics
 */
export interface EnrichmentResult {
  enriched: any[] | null;
  metrics: {
    expansion: number;
    similarity: number;
    reverted: boolean;
    reason?: string;
  };
}

/**
 * Apply enrichment guardrails to check if enriched content is acceptable
 * @param original - Original study texts array
 * @param enrichedContent - Enriched study texts array
 * @param expansionCap - Maximum allowed expansion ratio (default 0.25 = 25%)
 * @param similarityThreshold - Minimum required similarity score (default 0.85)
 * @returns EnrichmentResult with enriched content or null if reverted
 */
export function applyEnrichmentGuardrails(
  original: any[],
  enrichedContent: any[],
  expansionCap = 0.25,
  similarityThreshold = 0.85
): EnrichmentResult {
  // Calculate expansion ratio
  const origLen = original.map(s => String(s.content || '')).join('').length;
  const enrichLen = enrichedContent.map(s => String(s.content || '')).join('').length;
  const expansion = origLen > 0 ? enrichLen / origLen : 1.0;

  // Compute similarity
  const origText = original.map(s => String(s.content || '')).join('\n');
  const enrichText = enrichedContent.map(s => String(s.content || '')).join('\n');
  const similarity = computeSimilarity(origText, enrichText);

  // Check guardrails
  if (expansion > 1 + expansionCap) {
    return {
      enriched: null,
      metrics: {
        expansion,
        similarity,
        reverted: true,
        reason: 'expansion_exceeded'
      }
    };
  }

  if (similarity < similarityThreshold) {
    return {
      enriched: null,
      metrics: {
        expansion,
        similarity,
        reverted: true,
        reason: 'similarity_too_low'
      }
    };
  }

  return {
    enriched: enrichedContent,
    metrics: {
      expansion,
      similarity,
      reverted: false
    }
  };
}
