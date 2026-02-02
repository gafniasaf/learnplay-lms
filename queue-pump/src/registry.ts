import type { JobExecutor } from "./strategies/types.js";
import { BookGenerateChapter } from "./strategies/book_generate_chapter.js";
import { BookGenerateFull } from "./strategies/book_generate_full.js";
import { BookGenerateSection } from "./strategies/book_generate_section.js";
import { GenerateLessonPlan } from "./strategies/generate_lesson_plan.js";
import { GenerateMultiWeekPlan } from "./strategies/generate_multi_week_plan.js";

export const JobRegistry: Record<string, JobExecutor> = {
  book_generate_chapter: new BookGenerateChapter(),
  book_generate_full: new BookGenerateFull(),
  book_generate_section: new BookGenerateSection(),
  generate_lesson_plan: new GenerateLessonPlan(),
  generate_multi_week_plan: new GenerateMultiWeekPlan(),
};

