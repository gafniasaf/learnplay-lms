import { describe, it, expect, jest } from "@jest/globals";
import { buildSkeleton } from "../../_shared/skeleton.ts";

// Mock LLM generator to return JSON without studyTexts but with items
jest.doMock("../../_shared/ai.ts", () => ({
  generateJson: jest.fn(async () => {
    const items = Array.from({ length: 12 }).map((_, i) => ({
      id: i,
      text: `Item ${i} [blank]`,
      groupId: 0,
      clusterId: `c-${i}`,
      variant: "1",
      mode: "options",
      options: ["1", "2", "3"],
      correctIndex: 0,
    }));
    const text = JSON.stringify({ items });
    return { ok: true, text };
  }),
}));

describe("filler resilience", () => {
  it("synthesizes studyTexts when missing and still returns ok", async () => {
    const { fillSkeleton } = await import("../../_shared/filler.ts");
    const skeleton = buildSkeleton({
      subject: "math addition",
      grade: "3-5",
      itemsPerGroup: 12,
      levelsCount: 3,
      mode: "options",
    });

    const res = await fillSkeleton(skeleton as any, { requestId: "req-test", functionName: "test" } as any);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(Array.isArray(res.course.studyTexts)).toBe(true);
      expect(res.course.studyTexts.length).toBeGreaterThan(0);
      // Ensure no placeholder content remains
      expect(res.course.studyTexts.every((st) => st.content && st.content !== "__FILL__")).toBe(true);
    }
  });
});


