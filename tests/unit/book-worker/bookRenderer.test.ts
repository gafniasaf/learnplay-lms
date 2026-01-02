import { applyRewritesOverlay, renderBookHtml } from "../../../book-worker/lib/bookRenderer.js";

describe("book-worker/bookRenderer", () => {
  test("applyRewritesOverlay replaces basis by paragraph id", () => {
    const canonical = {
      chapters: [
        {
          title: "Ch 1",
          sections: [
            {
              title: "S 1",
              content: [
                { type: "paragraph", id: "p-1", basis: "Original 1" },
                { type: "paragraph", id: "p-2", basis: "Original 2" },
              ],
            },
          ],
        },
      ],
    };

    const overlay = {
      paragraphs: [{ paragraph_id: "p-2", rewritten: "Rewritten 2" }],
    };

    const assembled = applyRewritesOverlay(canonical, overlay) as any;
    expect(assembled.chapters[0].sections[0].content[0].basis).toBe("Original 1");
    expect(assembled.chapters[0].sections[0].content[1].basis).toBe("Rewritten 2");
  });

  test("renderBookHtml renders chapters/sections/paragraphs", () => {
    const canonical = {
      meta: { title: "Test Book" },
      chapters: [
        {
          title: "Ch 1",
          sections: [
            {
              title: "S 1",
              content: [{ type: "paragraph", id: "p-1", basis: "Hello world" }],
            },
          ],
        },
      ],
    };

    const html = renderBookHtml(canonical, { target: "book" });
    expect(html).toContain("Test Book");
    expect(html).toContain("Ch 1");
    expect(html).toContain("S 1");
    expect(html).toContain("Hello world");
    // New deterministic enhancements
    expect(html).toContain("In dit hoofdstuk leer je");
  });

  test("renderBookHtml injects cover page when coverUrl is provided (book target)", () => {
    const canonical = {
      meta: { title: "Cover Book" },
      chapters: [
        {
          title: "Ch 1",
          sections: [{ title: "S 1", content: [{ type: "paragraph", id: "p-1", basis: "Hello world" }] }],
        },
      ],
    };

    const coverUrl = "https://example.com/cover.png?x=1&y=2";
    const html = renderBookHtml(canonical, { target: "book", coverUrl });
    expect(html).toContain('class="figure-block full-width cover-page"');
    expect(html).toContain('src="https://example.com/cover.png?x=1&amp;y=2"');
  });

  test("renderBookHtml does not inject cover page for chapter target", () => {
    const canonical = {
      meta: { title: "Book" },
      chapters: [
        { title: "Ch 1", sections: [{ title: "S 1", content: [{ type: "paragraph", id: "p1", basis: "CH1" }] }] },
      ],
    };

    const html = renderBookHtml(canonical, { target: "chapter", chapterIndex: 0, coverUrl: "https://example.com/cover.png" });
    expect(html).not.toContain('class="figure-block full-width cover-page"');
  });

  test("renderBookHtml chapter target renders only selected chapter", () => {
    const canonical = {
      meta: { title: "Book" },
      chapters: [
        { title: "Ch 1", sections: [{ title: "S 1", content: [{ type: "paragraph", id: "p1", basis: "CHAPTER_ONE_ONLY_TEXT" }] }] },
        { title: "Ch 2", sections: [{ title: "S 2", content: [{ type: "paragraph", id: "p2", basis: "CHAPTER_TWO_ONLY_TEXT" }] }] },
      ],
    };

    const html = renderBookHtml(canonical, { target: "chapter", chapterIndex: 1 });
    expect(html).toContain("Ch 2");
    expect(html).toContain("CHAPTER_TWO_ONLY_TEXT");
    expect(html).not.toContain("Ch 1");
    expect(html).not.toContain("CHAPTER_ONE_ONLY_TEXT");
  });
});


