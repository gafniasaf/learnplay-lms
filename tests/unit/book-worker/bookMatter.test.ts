import { validateMatterPack } from "../../../src/lib/books/bookMatterCore.js";
import {
  renderMatterTitlePage,
  renderMatterColophonPage,
  renderMatterPromoPage,
  renderMatterTocPage,
  renderMatterIndexPage,
  renderMatterGlossaryPage,
} from "../../../src/lib/books/bookMatterTemplates.js";
import { assembleFinalBookHtml } from "../../../book-worker/lib/matterAssemble.js";
import { renderBookHtml } from "../../../book-worker/lib/bookRenderer.js";

function makePack() {
  return {
    schemaVersion: "matter_pack_v1",
    bookId: "book-1",
    bookVersionId: "ver-1",
    language: "nl",
    theme: {
      pageWidthMm: 210,
      pageHeightMm: 297,
      colors: {
        hboDonkerblauw: "#1e3a5f",
        vpGroen: "#2ba573",
        vpGroenLight: "#4cc793",
        textBlack: "#222222",
        textGray: "#666666",
        textLightGray: "#888888",
        bgWhite: "#ffffff",
        bgOffWhite: "#f9f9f9",
        accentBlue: "#007bc7",
      },
    },
    titlePage: {
      titleHtml: `Anatomie en<br>fysiologie<br><em>voor het mbo</em>`,
      authors: ["Asaf Gafni", "Stefan van Wonderen", "Steven C. Glas"],
      logoText: "ExpertCollege",
    },
    colophon: {
      isbn: "9789083251370",
      nur: "184",
      trefwoorden: "anatomie, fysiologie, klinisch redeneren, zorg",
      blocks: ["Dit is een uitgave van ExpertCollege", "Website: www.expertcollege.com"],
      legalText: "© Copyright 2024 ExpertCollege\nAlle rechten voorbehouden.",
    },
    toc: {
      title: "Inhoudsopgave",
      preamble: [{ label: "Introductie", page: "xv" }],
    },
    promo: {
      enabled: true,
      title: "MBOLEREN.NL",
      paragraphs: ["Mboleren.nl is het online leerplatform van ExpertCollege."],
      sections: [{ title: "Over de e-learningmodulen", paragraphs: ["Onze e-learningmodulen zijn overzichtelijk."] }],
      bullets: ["videomateriaal: Video’s en animaties", "simulaties: Handelingen oefenen"],
      ctaLabel: "Bekijk de interactieve animatie online",
    },
    index: { title: "Index" },
    glossary: { title: "Begrippen", footerLabel: "BEGRIPPEN" },
  };
}

describe("book matter pack + templates", () => {
  test("validateMatterPack fails loudly on missing fields", () => {
    const pack = makePack();
    // @ts-expect-error intentional invalid
    delete pack.bookId;
    const v = validateMatterPack(pack);
    expect(v.ok).toBe(false);
    if (v.ok) throw new Error("Expected ok=false");
    expect(v.issues.some((i) => i.code === "missing_bookId")).toBe(true);
  });

  test("validateMatterPack accepts a valid pack", () => {
    const v = validateMatterPack(makePack());
    expect(v.ok).toBe(true);
  });

  test("templates render without throwing", () => {
    const pack = makePack();
    const title = renderMatterTitlePage(pack);
    const colo = renderMatterColophonPage(pack);
    const promo = renderMatterPromoPage(pack);
    const toc = renderMatterTocPage(pack, { left: [], right: [] });
    const idx = renderMatterIndexPage(pack, { blocks: [] });
    const gl = renderMatterGlossaryPage(pack, { items: [], pageCounterReset: 10 });

    expect(title).toContain("Titelpagina");
    expect(title).toContain("Anatomie en");
    expect(colo).toContain("Colofon");
    expect(colo).toContain("ISBN");
    expect(promo).toContain("MB");
    expect(toc).toContain("Inhoudsopgave");
    expect(idx).toContain("<h1>Index</h1>");
    expect(gl).toContain("BEGRIPPEN");
    expect(gl).toContain("counter(page)");
  });

  test("assembleFinalBookHtml merges book html + inserts matter pages", () => {
    const canonical = {
      meta: { title: "Test Book" },
      chapters: [{ title: "Ch 1", sections: [{ title: "1.1 Sec", content: [{ type: "paragraph", id: "p1", basis: "Hello" }] }] }],
    };
    const bookHtml = renderBookHtml(canonical as any, { target: "book", includeToc: false, includeCover: false });

    const finalHtml = assembleFinalBookHtml({
      bookHtml,
      frontMatterPages: [{ kind: "title", src: "matter/matter.title-1.png" }],
      backMatterPages: [{ kind: "index", src: "matter/matter.index-1.png" }],
      pageWidthMm: 210,
      pageHeightMm: 297,
    });

    expect(finalHtml).toContain('data-kind="title"');
    expect(finalHtml).toContain('data-kind="index"');
    expect(finalHtml).toContain("Hello");
    expect(finalHtml).toContain("matter/matter.title-1.png");
  });
});


