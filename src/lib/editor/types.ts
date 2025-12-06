import type { OptionMedia } from '@/lib/media/types';

export type EditorOption = string | { text: string };

export interface EditorItem {
  options: EditorOption[];
  correctIndex?: number;
  mode?: 'numeric' | string;
  answer?: number | string;
  stem?: { text?: string } | null;
  text?: string | null;
  optionMedia?: OptionMedia[];
}

export interface CourseMeta {
  title?: string;
  subject?: string;
  gradeBand?: string;
}
