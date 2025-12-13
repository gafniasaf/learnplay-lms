import { toPlayableCourse } from "@/lib/adapters/playableCourse";

describe("toPlayableCourse", () => {
  it("unwraps get-course envelope { content } and returns legacy items[]", () => {
    const raw = {
      id: "english-grammar-foundations",
      format: "practice",
      version: 1,
      content: {
        id: "english-grammar-foundations",
        title: "English Grammar Foundations",
        groups: [{ id: 0, name: "G0" }],
        levels: [{ id: 1, title: "L1", start: 0, end: 0 }],
        items: [
          {
            id: 1,
            groupId: 0,
            text: "Q",
            explain: "E",
            clusterId: "c",
            variant: "1",
            mode: "options",
            options: ["a", "b"],
            correctIndex: 0,
          },
        ],
      },
    };
    const course = toPlayableCourse(raw, "english-grammar-foundations");
    expect(Array.isArray(course.items)).toBe(true);
    expect(course.items.length).toBe(1);
  });

  it("converts nested level/group schema into legacy items[]", () => {
    const raw = {
      title: "Math Basics",
      grade_band: "3-5",
      levels: [
        {
          level: 1,
          groups: [
            {
              group: 1,
              items: [
                {
                  stem: "2+2?",
                  options: ["3", "4", "5"],
                  correct_answer: "4",
                  explanation: "2+2=4",
                },
              ],
            },
          ],
        },
      ],
    };
    const course = toPlayableCourse(raw, "math-basics-001");
    expect(course.id).toBe("math-basics-001");
    expect(course.items.length).toBe(1);
    expect(course.items[0].correctIndex).toBe(1);
    expect(course.groups.length).toBeGreaterThan(0);
    expect(course.levels.length).toBeGreaterThan(0);
  });
});


