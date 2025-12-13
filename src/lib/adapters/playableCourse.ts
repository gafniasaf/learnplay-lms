import type { Course, CourseGroup, CourseItem, CourseLevel } from "@/lib/types/course";

type EnvelopeCourse = {
  id?: string;
  content?: unknown;
  course?: unknown;
  data?: { course?: unknown };
};

type NestedCourse = {
  title?: string;
  description?: string;
  grade_band?: string;
  levels?: Array<{
    level?: number;
    groups?: Array<{
      group?: number;
      items?: Array<{
        stem?: string;
        options?: string[];
        correct_answer?: string;
        explanation?: string;
      }>;
    }>;
  }>;
};

function unwrap(raw: unknown): any {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as EnvelopeCourse;
  return r.course ?? r.data?.course ?? r.content ?? raw;
}

function isPlayableLegacyCourse(c: any): c is Course {
  return !!c && typeof c === "object" && typeof c.id === "string" && Array.isArray(c.items);
}

function coerceCorrectIndex(options: string[], correct: string | undefined): number {
  if (!correct) return 0;
  const exact = options.indexOf(correct);
  if (exact >= 0) return exact;
  const lowered = options.map((o) => o.toLowerCase());
  const idx = lowered.indexOf(correct.toLowerCase());
  return idx >= 0 ? idx : 0;
}

/**
 * Convert whatever `get-course` returns into the legacy playable Course shape.
 * This is intentionally strict: if we can't derive `items[]`, we throw a clear error.
 */
export function toPlayableCourse(raw: unknown, fallbackId: string): Course {
  const unwrapped = unwrap(raw);

  if (isPlayableLegacyCourse(unwrapped)) {
    return unwrapped;
  }

  // get-course "envelope" shape: { id, format, version, content: { ...legacy course... } }
  if (unwrapped && typeof unwrapped === "object" && (unwrapped as any).content) {
    const content = unwrap((unwrapped as any).content);
    if (isPlayableLegacyCourse(content)) return content;
  }

  // Nested proto schema: { title, description, grade_band, levels:[{ level, groups:[{ group, items:[{ stem, options, correct_answer, explanation }]}]}]}
  const nested = unwrapped as NestedCourse;
  if (nested?.levels && Array.isArray(nested.levels)) {
    const id = (unwrapped as any)?.id || fallbackId;
    const title = (unwrapped as any)?.title || nested.title || id;

    const groupIds = new Set<number>();
    const items: CourseItem[] = [];
    let nextId = 1;

    for (const lvl of nested.levels) {
      for (const g of lvl.groups || []) {
        const gid = typeof g.group === "number" ? g.group : 0;
        groupIds.add(gid);
        for (const it of g.items || []) {
          const options = Array.isArray(it.options) ? it.options : [];
          items.push({
            id: nextId++,
            groupId: gid,
            text: it.stem || "",
            explain: it.explanation || "",
            clusterId: `${id}-g${gid}-i${nextId}`,
            variant: "1",
            mode: "options",
            options,
            correctIndex: coerceCorrectIndex(options, it.correct_answer),
          });
        }
      }
    }

    const groups: CourseGroup[] = Array.from(groupIds)
      .sort((a, b) => a - b)
      .map((gid) => ({ id: gid, name: `Group ${gid}` }));

    const levels: CourseLevel[] = (nested.levels || [])
      .map((lvl) => {
        const idNum = typeof lvl.level === "number" ? lvl.level : undefined;
        const groupNums = (lvl.groups || [])
          .map((g) => (typeof g.group === "number" ? g.group : null))
          .filter((x): x is number => x !== null);
        const start = groupNums.length ? Math.min(...groupNums) : 0;
        const end = groupNums.length ? Math.max(...groupNums) : 0;
        return idNum
          ? { id: idNum, title: `Level ${idNum}`, start, end }
          : null;
      })
      .filter((x): x is CourseLevel => x !== null);

    if (items.length === 0) {
      throw new Error(
        `Course '${fallbackId}' is not playable yet (no items could be derived from nested schema).`
      );
    }

    // Provide a single fallback level if none exist
    const finalLevels =
      levels.length > 0
        ? levels
        : [
            {
              id: 1,
              title: "All Content",
              start: Math.min(...Array.from(groupIds)),
              end: Math.max(...Array.from(groupIds)),
            },
          ];

    return {
      id,
      title,
      description: (unwrapped as any)?.description || nested.description,
      groups,
      levels: finalLevels,
      items,
    };
  }

  throw new Error(`Course content is invalid (missing items). Please republish this course.`);
}


