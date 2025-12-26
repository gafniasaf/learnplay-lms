/**
 * Course Types for LearnPlay Platform
 * 
 * These types define the structure of learning content.
 * Simplified from dawn-react-starter - no legacy migration code.
 */

export interface CourseLevel {
  id: number;
  start: number;
  end: number;
  title: string;
  description?: string;
  minScore?: number;
}

export interface CourseGroup {
  id: number;
  name: string;
  /** Optional hierarchy metadata (used by legacy imports / outline navigation) */
  parentId?: number;
  treeLevel?: number;
  color?: string;
}

export interface StudyText {
  id: string;
  title: string;
  content: string;
  order: number;
  /** Optional hierarchy metadata (used by legacy imports / outline navigation) */
  parentId?: string;
  treeLevel?: number;
  learningObjectives?: string[];
  metadata?: {
    difficulty?: string;
    estimatedReadingTime?: number;
    keywords?: string[];
  };
  _import?: {
    sourceStudyTextId?: number;
    sourceSubjectId?: number;
  };
}

export interface CourseItem {
  id: number;
  groupId: number;
  text: string;
  explain: string;
  clusterId: string;
  variant: string;
  mode?: 'options' | 'numeric';
  options: string[];
  correctIndex: number;
  wrongExplanations?: string[];
  answer?: number;
  /**
   * Progressive hints (preferred).
   * - nudge: gentle conceptual reminder
   * - guide: more specific directional clue
   * - reveal: near-solution without stating the answer verbatim
   */
  hints?: {
    nudge?: string;
    guide?: string;
    reveal?: string;
  };
  /** Legacy single hint (backwards compatible) */
  hint?: string;
  relatedStudyTextIds?: string[];
  learningObjectiveId?: string;
  stimulus?: 
    | { type: 'image'; url: string; alt?: string; placement?: 'block' | 'inline' }
    | { type: 'audio'; url: string; transcriptUrl?: string; placement?: 'block' | 'inline' }
    | { type: 'video'; url: string; captionsUrl?: string; placement?: 'block' | 'inline' };
  optionMedia?: (
    | { type: 'image'; url: string; alt?: string; fitMode?: 'cover' | 'contain'; width?: number; height?: number }
    | { type: 'audio'; url: string; transcriptUrl?: string }
    | { type: 'video'; url: string; captionsUrl?: string; fitMode?: 'cover' | 'contain'; width?: number; height?: number }
    | null
  )[];
}

export interface Course {
  id: string;
  title: string;
  locale?: string;
  availableLocales?: string[];
  contentVersion?: string;
  format?: string;
  description?: string;
  subject?: string;
  gradeBand?: string;
  studyTexts?: StudyText[];
  levels: CourseLevel[];
  groups: CourseGroup[];
  items: CourseItem[];
  _import?: {
    sourceSystem?: string;
    sourceCourseId?: number;
    importedAt?: string;
    importVersion?: string;
  };
}



