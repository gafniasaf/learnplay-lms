import { canonicalToSkeleton, compileSkeletonToCanonical, validateBookSkeleton } from "@/lib/books/bookSkeletonCore.js";

describe("bookSkeletonCore", () => {
  it("canonicalToSkeleton -> validate -> compile produces canonical with stable paragraph ids and images", () => {
    const canonical = {
      meta: { id: "b1", title: "Demo", level: "n3", language: "nl" },
      chapters: [
        {
          title: "1. Hoofdstuk",
          openerImage: "images/ch1.png",
          sections: [
            {
              id: "1.1",
              title: "",
              content: [
                {
                  type: "paragraph",
                  id: "p1",
                  basis: "Hallo <<BOLD_START>>wereld<<BOLD_END>>",
                  images: [{ src: "img/a.png", caption: "Cap", figureNumber: "1.1" }],
                },
                { type: "list", id: "l1", ordered: false, items: ["a", "b"], images: [{ src: "img/b.png" }] },
              ],
            },
          ],
        },
      ],
    };

    const sk = canonicalToSkeleton(canonical, { bookId: "b1", bookVersionId: "bv1" });
    const v = validateBookSkeleton(sk);
    expect(v.ok).toBe(true);
    if (!v.ok) return;

    const compiled = compileSkeletonToCanonical(v.skeleton);
    const p = compiled?.chapters?.[0]?.sections?.[0]?.content?.find((x: any) => x?.type === "paragraph");
    expect(p?.id).toBe("p1");
    expect(Array.isArray(p?.images)).toBe(true);
    expect(p.images[0].src).toBe("img/a.png");

    const list = compiled?.chapters?.[0]?.sections?.[0]?.content?.find((x: any) => x?.type === "list");
    expect(list?.id).toBe("l1");
    expect(list?.items?.length).toBe(2);
    expect(list?.images?.[0]?.src).toBe("img/b.png");
  });

  it("validator flags disallowed markers", () => {
    const sk: any = {
      meta: { bookId: "b", bookVersionId: "bv", title: "t", level: "n3", schemaVersion: "skeleton_v1" },
      chapters: [
        {
          id: "ch-1",
          number: 1,
          title: "1. x",
          sections: [
            {
              id: "1.1",
              title: "1.1 y",
              blocks: [{ type: "paragraph", id: "p1", basisHtml: "bad <<TERM>> marker" }],
            },
          ],
        },
      ],
    };
    const v = validateBookSkeleton(sk);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.issues.some((i) => i.code === "disallowed_markers" && i.severity === "error")).toBe(true);
  });
});


