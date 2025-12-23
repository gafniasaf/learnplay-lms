import type { OptionMedia } from '@/lib/media/types';

export type EditorOption = string | { text: string };

export interface EditorItem {
  id?: number;
  options: EditorOption[];
  correctIndex?: number;
  mode?: 'numeric' | string;
  answer?: number | string;
  stem?: { text?: string } | null;
  text?: string | null;
  hints?: {
    nudge?: string;
    guide?: string;
    reveal?: string;
  };
  hint?: string;
  optionMedia?: OptionMedia[];
}

export interface CourseMeta {
  title?: string;
  subject?: string;
  gradeBand?: string;
}
