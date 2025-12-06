/**
 * Exercise Item Type Definitions
 * 
 * Proper TypeScript types for all 13 exercise modes supported by the Play page.
 * This replaces unsafe 'as any' casts with type-safe discriminated unions.
 */

// Base type from course (if it exists, otherwise we define our own)
type BaseExerciseItem = {
  id: number;
  text: string;
  mode?: string;
  options?: string[];
  [key: string]: unknown;
};

/**
 * Base properties shared by all exercise items
 */
export interface ExerciseItemBase {
  id: number;
  text: string;
  stimulus?: {
    type: 'image' | 'audio' | 'video';
    url: string;
    alt?: string;
  };
  relatedStudyTextIds?: number[];
  clusterId?: number;
  variant?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

/**
 * Options mode (Multiple Choice Question)
 */
export interface OptionsExerciseItem extends ExerciseItemBase {
  mode: 'options';
  options: string[];
  correctIndex: number;
  explanation?: string;
  optionMedia?: Array<{ type: 'image' | 'audio'; url: string }>;
}

/**
 * Numeric input mode
 */
export interface NumericExerciseItem extends ExerciseItemBase {
  mode: 'numeric';
  correctAnswer: number;
  tolerance?: number;
  explanation?: string;
}

/**
 * Visual MCQ mode (Image-based multiple choice)
 */
export interface VisualMCQExerciseItem extends ExerciseItemBase {
  mode: 'visual-mcq';
  options: string[]; // Image URLs
  correctIndex: number;
  explanation?: string;
}

/**
 * Audio MCQ mode (Audio-based multiple choice)
 */
export interface AudioMCQExerciseItem extends ExerciseItemBase {
  mode: 'audio-mcq';
  options: Array<{ label: string; audioUrl: string }>;
  correctIndex: number;
  explanation?: string;
}

/**
 * Video prompt mode
 */
export interface VideoPromptExerciseItem extends ExerciseItemBase {
  mode: 'video-prompt';
  videoUrl: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

/**
 * Drag and drop classification mode
 */
export interface DragDropExerciseItem extends ExerciseItemBase {
  mode: 'drag-drop';
  items: Array<{ id: string; content: string }>;
  categories: Array<{ id: string; label: string; correctItemIds: string[] }>;
  explanation?: string;
}

/**
 * Matching pairs mode
 */
export interface MatchingPairsExerciseItem extends ExerciseItemBase {
  mode: 'matching';
  pairs: Array<{ left: string; right: string; id: string }>;
  explanation?: string;
}

/**
 * Ordering/sequencing mode
 */
export interface OrderingExerciseItem extends ExerciseItemBase {
  mode: 'ordering';
  items: Array<{ id: string; content: string; correctPosition: number }>;
  explanation?: string;
}

/**
 * Diagram labeling mode
 */
export interface DiagramLabelingExerciseItem extends ExerciseItemBase {
  mode: 'diagram-label';
  diagramUrl: string;
  hotspots: Array<{
    id: string;
    x: number; // percentage
    y: number; // percentage
    correctLabel: string;
    alternatives?: string[];
  }>;
  explanation?: string;
}

/**
 * Manipulative numeric mode (Slider-based)
 */
export interface ManipulativeNumericExerciseItem extends ExerciseItemBase {
  mode: 'manipulative';
  min: number;
  max: number;
  step: number;
  correctValue: number;
  tolerance?: number;
  unit?: string;
  explanation?: string;
}

/**
 * Graph interpretation mode
 */
export interface GraphInterpretationExerciseItem extends ExerciseItemBase {
  mode: 'graph-interpret';
  graphUrl: string;
  graphType: 'bar' | 'line' | 'pie' | 'scatter';
  options: string[];
  correctIndex: number;
  explanation?: string;
}

/**
 * Timed fluency mode (Rapid-fire questions)
 */
export interface TimedFluencyExerciseItem extends ExerciseItemBase {
  mode: 'timed-fluency';
  duration: number; // seconds
  subQuestions: Array<{
    text: string;
    correctAnswer: string | number;
  }>;
  explanation?: string;
}

/**
 * Discriminated union of all exercise item types
 * Use this for type-safe handling of different exercise modes
 */
export type TypedExerciseItem =
  | OptionsExerciseItem
  | NumericExerciseItem
  | VisualMCQExerciseItem
  | AudioMCQExerciseItem
  | VideoPromptExerciseItem
  | DragDropExerciseItem
  | MatchingPairsExerciseItem
  | OrderingExerciseItem
  | DiagramLabelingExerciseItem
  | ManipulativeNumericExerciseItem
  | GraphInterpretationExerciseItem
  | TimedFluencyExerciseItem;

/**
 * Type guard to check if an item is of a specific mode
 */
export function isExerciseMode<T extends TypedExerciseItem['mode']>(
  item: BaseExerciseItem | TypedExerciseItem,
  mode: T
): item is Extract<TypedExerciseItem, { mode: T }> {
  return 'mode' in item && item.mode === mode;
}

/**
 * Type guard helpers for common modes
 */
export const isOptionsItem = (item: BaseExerciseItem | TypedExerciseItem): item is OptionsExerciseItem =>
  isExerciseMode(item, 'options');

export const isNumericItem = (item: BaseExerciseItem | TypedExerciseItem): item is NumericExerciseItem =>
  isExerciseMode(item, 'numeric');

export const isVisualMCQItem = (item: BaseExerciseItem | TypedExerciseItem): item is VisualMCQExerciseItem =>
  isExerciseMode(item, 'visual-mcq');

export const isAudioMCQItem = (item: BaseExerciseItem | TypedExerciseItem): item is AudioMCQExerciseItem =>
  isExerciseMode(item, 'audio-mcq');

export const isVideoPromptItem = (item: BaseExerciseItem | TypedExerciseItem): item is VideoPromptExerciseItem =>
  isExerciseMode(item, 'video-prompt');

export const isDragDropItem = (item: BaseExerciseItem | TypedExerciseItem): item is DragDropExerciseItem =>
  isExerciseMode(item, 'drag-drop');

export const isMatchingPairsItem = (item: BaseExerciseItem | TypedExerciseItem): item is MatchingPairsExerciseItem =>
  isExerciseMode(item, 'matching');

export const isOrderingItem = (item: BaseExerciseItem | TypedExerciseItem): item is OrderingExerciseItem =>
  isExerciseMode(item, 'ordering');

export const isDiagramLabelingItem = (item: BaseExerciseItem | TypedExerciseItem): item is DiagramLabelingExerciseItem =>
  isExerciseMode(item, 'diagram-label');

export const isManipulativeNumericItem = (item: BaseExerciseItem | TypedExerciseItem): item is ManipulativeNumericExerciseItem =>
  isExerciseMode(item, 'manipulative');

export const isGraphInterpretationItem = (item: BaseExerciseItem | TypedExerciseItem): item is GraphInterpretationExerciseItem =>
  isExerciseMode(item, 'graph-interpret');

export const isTimedFluencyItem = (item: BaseExerciseItem | TypedExerciseItem): item is TimedFluencyExerciseItem =>
  isExerciseMode(item, 'timed-fluency');

