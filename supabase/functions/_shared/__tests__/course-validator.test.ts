import { describe, it, expect } from "@jest/globals";
import { validateCourse } from "../course-validator.ts";

const baseCourse = {
  id: "kidneys-g1",
  title: "Kidneys Course",
  subject: "kidneys",
  contentVersion: "test",
  gradeBand: "Grade 1",
  groups: [{ id: 0, name: "Basics" }],
  levels: [{ id: 1, title: "Level 1", start: 0, end: 0 }],
  items: [{
    id: 0,
    text: "Your kidneys clean your [blank].",
    groupId: 0,
    clusterId: "c1",
    variant: "1" as const,
    mode: "options" as const,
    options: ["blood", "shoes", "clouds"],
    correctIndex: 0,
  }],
  studyTexts: [{
    id: "section-definition",
    title: "Definition",
    order: 1,
    content: "[SECTION:Definition]\nKidneys clean the blood.",
  }],
};

const mockPack = {
  pack_id: "kidneys.g1",
  topic: "kidneys",
  grade: 1,
  version: 1,
  allowed_vocab: {
    content: ["kidneys", "clean", "blood"],
    function: ["the", "your", "are"],
  },
  banned_terms: ["poop"],
  reading_level_max: 1,
};

const makeCourse = (overrides: Partial<typeof baseCourse>) => ({
  ...baseCourse,
  ...overrides,
  items: overrides.items ?? baseCourse.items,
  studyTexts: overrides.studyTexts ?? baseCourse.studyTexts,
});

describe("validateCourse knowledge-pack gates", () => {
  it("flags banned terms when pack metadata is provided", () => {
    const course = makeCourse({
      studyTexts: [{
        id: "section-definition",
        title: "Definition",
        order: 1,
        content: "[SECTION:Definition]\nThis mentions poop.",
      }],
    });

    const result = validateCourse(course as any, { knowledgePack: mockPack as any });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "banned_term")).toBe(true);
  });

  it("flags readability issues beyond the configured threshold", () => {
    const longSentence =
      "Kidneys are remarkable filtration organs that meticulously process plasma through intricate nephron structures far beyond a first grader's vocabulary.";
    const course = makeCourse({
      studyTexts: [{
        id: "section-definition",
        title: "Definition",
        order: 1,
        content: `[SECTION:Definition]\n${longSentence}`,
      }],
    });

    const result = validateCourse(course as any, { knowledgePack: mockPack as any });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === "readability")).toBe(true);
  });
});

