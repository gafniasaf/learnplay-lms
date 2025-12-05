import { extractHtmlSnippet, extractAllHtmlSnippets, extractPageTitle } from '@/lib/htmlUtils';

export interface LaneTemplate {
  id: string;
  title: string;
  keywords: string[];
  instructions: string;
  validationHints: string[];
}

export interface LaneSpec extends LaneTemplate {
  content: string;
  providedHtml?: string | null;
}

export interface LaneDiagnostics {
  skippedHeadings: string[];
  truncatedCount: number;
  totalCandidates: number;
}

export interface LaneBuildResult {
  lanes: LaneSpec[];
  diagnostics: LaneDiagnostics;
}

interface SectionClassification {
  heading: string;
  type: 'ui_page' | 'documentation';
  reason: string;
  validationHints?: string[];
}

const FALLBACK_TEMPLATES: LaneTemplate[] = [
  {
    id: 'home',
    title: 'Public Home',
    keywords: ['Public & Authentication', 'Home Page', 'Landing'],
    instructions:
      'Render the marketing landing page with hero, portal grid, CTA buttons, and global header/footer.',
    validationHints: ['Hero Section', 'Portal Grid', 'CTA Buttons', 'Header + Footer'],
  },
  {
    id: 'auth',
    title: 'Authentication',
    keywords: ['Authentication Page', 'Reset Password', 'Login', 'Sign Up'],
    instructions:
      'Design the login/sign-up experience with tabs, inputs, social auth, and forgot password modal.',
    validationHints: ['Login Tab', 'Sign Up Tab', 'Social Buttons', 'Forgot Password'],
  },
  {
    id: 'dashboard',
    title: 'Main Dashboard',
    keywords: ['Dashboard', 'Overview', 'Main Screen'],
    instructions:
      'Build the main dashboard with summary cards, navigation, and key metrics.',
    validationHints: ['Summary Cards', 'Navigation', 'Key Metrics'],
  },
  {
    id: 'admin',
    title: 'Admin Panel',
    keywords: ['Admin', 'Management', 'Settings'],
    instructions:
      'Mock the admin workspace with sidebar, data tables, and management controls.',
    validationHints: ['Sidebar', 'Data Table', 'Controls'],
  },
];

const MAX_LANES = 10;
export const MAX_LANE_COUNT = MAX_LANES;
const UI_KEYWORDS = [
  'page',
  'screen',
  'view',
  'dashboard',
  'console',
  'portal',
  'panel',
  'flow',
  'lane',
  'wizard',
  'hub',
  'editor',
  'workspace',
  'auth',
  'login',
  'settings',
  'profile',
  'report',
  'analytics',
  'inbox',
  'timeline',
  'board',
  'composer',
];
const NOISE_PREFIXES = [/^phase\b/i, /^discovery\b/i, /^trade[- ]offs?/i, /^gains?/i, /^manifest\b/i, /^additional\b/i];

function normalizeHeading(raw: string): string {
  return raw.replace(/^#{2,4}\s+/, '').trim();
}

function looksLikeUiSection(title: string, body: string): boolean {
  const normalized = normalizeHeading(title).toLowerCase();
  if (!normalized) return false;

  if (NOISE_PREFIXES.some((regex) => regex.test(normalized))) {
    return false;
  }

  if (UI_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return true;
  }

  const bodyLower = body.toLowerCase();
  if (bodyLower.includes('<html') || bodyLower.includes('<section') || bodyLower.includes('<div')) {
    return true;
  }

  // Allow generic headings if body explicitly references “mockup” or “ui”
  if (bodyLower.includes('mockup') || bodyLower.includes('ui ')) {
    return true;
  }

  return false;
}

function prioritizeLanes(lanes: LaneSpec[], diagnostics: LaneDiagnostics): LaneSpec[] {
  if (lanes.length <= MAX_LANES) {
    diagnostics.truncatedCount = 0;
    return lanes;
  }

  const scored = lanes.map((lane, index) => {
    const titleLower = lane.title.toLowerCase();
    const keywordBoost = UI_KEYWORDS.some((keyword) => titleLower.includes(keyword)) ? 10 : 0;
    const htmlBoost = lane.providedHtml ? 20 : 0;
    return {
      lane,
      score: htmlBoost + keywordBoost - index / 100,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, MAX_LANES).map((item) => item.lane);
  diagnostics.truncatedCount = lanes.length - selected.length;
  return selected;
}

interface ParsedSection {
  heading: string;
  body: string;
}

function extractSections(doc: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const lines = doc.split(/\r?\n/);
  let currentHeading = '';
  let currentBody: string[] = [];

  const flush = () => {
    if (!currentHeading) return;
    sections.push({
      heading: currentHeading.trim(),
      body: currentBody.join('\n').trim(),
    });
    currentBody = [];
  };

  lines.forEach((line) => {
    if (line.trim().match(/^#{2,4}\s+/)) {
      flush();
      currentHeading = line.trim();
    } else {
      currentBody.push(line);
    }
  });
  flush();

  return sections;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/^#{2,4}\s+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'page';
}

function extractValidationHints(html: string): string[] {
  const hints: string[] = [];
  const headerMatch = html.match(/<header[^>]*>/i);
  const footerMatch = html.match(/<footer[^>]*>/i);
  const navMatch = html.match(/<nav[^>]*>/i);
  const formMatch = html.match(/<form[^>]*>/i);
  const tableMatch = html.match(/<table[^>]*>/i);

  if (headerMatch) hints.push('Header');
  if (footerMatch) hints.push('Footer');
  if (navMatch) hints.push('Navigation');
  if (formMatch) hints.push('Form');
  if (tableMatch) hints.push('Table');

  if (hints.length === 0) hints.push('Main Content');

  return hints;
}

function withRequiredElements(base: string, hints: string[]): string {
  if (!hints.length) return base.trim();
  const checklist = hints.map((hint, idx) => `${idx + 1}. ${hint}`).join('\n');
  return `${base.trim()}\n\nREQUIRED ELEMENTS:\n${checklist}`.trim();
}

export async function classifySections(
  sections: ParsedSection[],
  supabaseInvoke: (name: string, opts: any) => Promise<any>,
): Promise<SectionClassification[]> {
  if (sections.length === 0) return [];

  try {
    const { data, error } = await supabaseInvoke('architect-advisor', {
      body: {
        mode: 'analyze-document',
        prompt: 'Classify document sections',
        sections: sections.map((s) => ({
          heading: s.heading,
          preview: s.body.slice(0, 300),
        })),
      },
    });

    if (error) {
      console.warn('[classifySections] LLM call failed, falling back to all sections', error);
      return sections.map((s) => ({
        heading: s.heading,
        type: 'ui_page' as const,
        reason: 'Fallback: LLM unavailable',
      }));
    }

    const parsed = typeof data?.result === 'string' ? JSON.parse(data.result) : data?.result;
    const classifications = Array.isArray(parsed?.sections) ? parsed.sections : [];
    return classifications;
  } catch (err) {
    console.warn('[classifySections] Exception, falling back', err);
    return sections.map((s) => ({
      heading: s.heading,
      type: 'ui_page' as const,
      reason: 'Fallback: Exception',
    }));
  }
}

async function inferLanesFromDocument(
  sections: ParsedSection[],
  supabaseInvoke: (name: string, opts: any) => Promise<any>,
): Promise<LaneSpec[]> {
  const classifications = await classifySections(sections, supabaseInvoke);
  const classificationMap = new Map(classifications.map(c => [c.heading, c]));

  const lanes: LaneSpec[] = [];

  sections.forEach((section) => {
    const cleanHeading = section.heading.replace(/^#{2,4}\s+/, '').trim();
    const classification = classificationMap.get(section.heading);
    const isUiPage = classification?.type === 'ui_page';

    if (!isUiPage) return;

    const html = extractHtmlSnippet(section.body);
    const id = slugify(section.heading);
    const title = cleanHeading;

    const validationHints = classification?.validationHints?.length
      ? classification.validationHints
      : (html ? extractValidationHints(html) : []);

    lanes.push({
      id,
      title,
      keywords: [title],
      instructions: html
        ? `Render ${title} exactly as provided in the document.`
        : `Generate ${title} based on the document context.`,
      validationHints,
      content: withRequiredElements(`${section.heading}\n${section.body}`, validationHints),
      providedHtml: html || undefined,
    });
  });

  return lanes;
}

function inferLanesFromRawHtml(doc: string): LaneSpec[] {
  const allHtml = extractAllHtmlSnippets(doc);
  if (allHtml.length === 0) return [];

  return allHtml.map((html, idx) => {
    const title = extractPageTitle(html) || `Page ${idx + 1}`;
    const id = slugify(title);
    const validationHints = extractValidationHints(html);

    return {
      id,
      title,
      keywords: [title],
      instructions: `Render ${title} exactly as provided in the document.`,
      validationHints,
      content: withRequiredElements(html, validationHints),
      providedHtml: html,
    };
  });
}

export async function buildLaneSpecs(
  doc: string,
  supabaseInvoke?: (name: string, opts: any) => Promise<any>,
): Promise<LaneBuildResult> {
  const sections = extractSections(doc);
  const diagnostics: LaneDiagnostics = {
    skippedHeadings: [],
    truncatedCount: 0,
    totalCandidates: sections.length,
  };

  let candidateLanes: LaneSpec[] = [];

  if (sections.length > 0 && supabaseInvoke) {
    const inferred = await inferLanesFromDocument(sections, supabaseInvoke);
    if (inferred.length > 0) {
      candidateLanes = inferred;
    } else {
      console.warn('[buildLaneSpecs] No UI sections detected by LLM, falling back to heuristics');
    }
  }

  if (candidateLanes.length === 0 && sections.length > 0) {
    candidateLanes = sections.map((section) => {
      const html = extractHtmlSnippet(section.body);
      const id = slugify(section.heading);
      const title = normalizeHeading(section.heading);
      const validationHints = html ? extractValidationHints(html) : [];

      return {
        id,
        title,
        keywords: [title],
        instructions: html
          ? `Render ${title} exactly as provided in the document.`
          : `Generate ${title} based on the document context.`,
        validationHints,
        content: withRequiredElements(`${section.heading}\n${section.body}`, validationHints),
        providedHtml: html || undefined,
      };
    });
  }

  if (candidateLanes.length === 0) {
    const rawHtmlLanes = inferLanesFromRawHtml(doc);
    if (rawHtmlLanes.length > 0) {
      return {
        lanes: rawHtmlLanes.slice(0, MAX_LANES),
        diagnostics: {
          skippedHeadings: [],
          truncatedCount: Math.max(0, rawHtmlLanes.length - MAX_LANES),
          totalCandidates: rawHtmlLanes.length,
        },
      };
    }

    const fallback = doc.trim();
    const fallbackLanes = FALLBACK_TEMPLATES.map((template) => {
      const matchedSection = sections.find(({ heading, body }) => {
        const needle = template.keywords.map((k) => k.toLowerCase());
        const haystack = `${heading} ${body}`.toLowerCase();
        return needle.some((n) => haystack.includes(n));
      });

      const baseContent = matchedSection
        ? `${matchedSection.heading}\n${matchedSection.body}`.trim()
        : fallback;

      return {
        ...template,
        content: withRequiredElements(baseContent, template.validationHints),
        providedHtml: undefined,
      };
    });

    return {
      lanes: fallbackLanes,
      diagnostics: {
        skippedHeadings: [],
        truncatedCount: 0,
        totalCandidates: fallbackLanes.length,
      },
    };
  }

  diagnostics.totalCandidates = candidateLanes.length;

  const filteredLanes: LaneSpec[] = [];
  candidateLanes.forEach((lane) => {
    if (looksLikeUiSection(lane.title, lane.content)) {
      filteredLanes.push(lane);
    } else {
      diagnostics.skippedHeadings.push(lane.title);
    }
  });

  // If filtering removed everything, fall back to the first few sections so the user still sees lanes.
  let lanesToEvaluate: LaneSpec[];
  if (filteredLanes.length > 0) {
    lanesToEvaluate = filteredLanes;
  } else {
    diagnostics.skippedHeadings = [];
    lanesToEvaluate = candidateLanes.slice(0, Math.min(candidateLanes.length, MAX_LANES));
  }

  const prioritized = prioritizeLanes(lanesToEvaluate, diagnostics);

  return {
    lanes: prioritized,
    diagnostics,
  };
}

export { FALLBACK_TEMPLATES as LANE_TEMPLATES };
