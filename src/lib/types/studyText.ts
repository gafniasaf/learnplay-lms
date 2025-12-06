/**
 * Type definitions for study texts (reference materials)
 */

export interface StudyTextSection {
  title: string;
  content: string[];  // Array of paragraphs
  images: string[];   // Array of image URLs
}

export interface StudyText {
  id: string;
  title: string;
  content: string;  // Raw content with [SECTION:] and [IMAGE:] markers
  order: number;
  learningObjectives?: string[];
  metadata?: {
    difficulty?: string;
    estimatedReadingTime?: number;  // minutes
    keywords?: string[];
  };
}

export interface CourseWithStudyTexts {
  id: string;
  title: string;
  description?: string;
  studyTexts?: StudyText[];
  items: any[];  // Existing CourseItem[]
  groups?: any[];
  levels?: any[];
}

/**
 * Parse study text content into structured sections
 */
export function parseStudyText(content: string): StudyTextSection[] {
  const sections: StudyTextSection[] = [];
  const lines = content.split('\n');
  
  let currentSection: StudyTextSection | null = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('[SECTION:')) {
      // Extract section title
      const match = trimmed.match(/\[SECTION:(.*?)\]/);
      const title = match ? match[1] : 'Untitled';
      
      currentSection = { title, content: [], images: [] };
      sections.push(currentSection);
  } else if (trimmed.startsWith('[IMAGE:')) {
      // Extract image path or placeholder
      const match = trimmed.match(/\[IMAGE:(.*?)\]/);
      const imageToken = match ? match[1] : '';
      
      // Only treat as a real image if it's path-like or URL (prevents broken placeholders)
      const isUrl = /^https?:\/\//i.test(imageToken);
      const looksLikePath = /\//.test(imageToken) || /\.(png|jpe?g|webp|gif|svg)$/i.test(imageToken);
      if (currentSection && imageToken && (isUrl || looksLikePath)) {
        currentSection.images.push(imageToken);
      }
    } else if (currentSection && trimmed) {
      // Add content to current section
      currentSection.content.push(trimmed);
    } else if (!currentSection && trimmed) {
      // Content before first section - create intro section
      currentSection = { title: 'Introduction', content: [trimmed], images: [] };
      sections.push(currentSection);
    }
  }
  
  return sections;
}

/**
 * Estimate reading time based on content length
 */
export function estimateReadingTime(content: string): number {
  const wordsPerMinute = 200;
  const words = content.split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
}

/**
 * Extract all image paths from study text
 */
export function extractImagePaths(content: string): string[] {
  const imageRegex = /\[IMAGE:(.*?)\]/g;
  const matches = content.matchAll(imageRegex);
  return Array.from(matches, m => m[1]);
}

