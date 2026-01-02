import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const callGet = jest.fn();
const call = jest.fn();

jest.mock("@/hooks/useMCP", () => ({
  useMCP: () => ({
    callGet,
    call,
  }),
}));

const toastSpy = jest.fn();
jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u-admin", app_metadata: { role: "admin" }, user_metadata: { role: "admin" } },
    role: "admin",
    loading: false,
  }),
}));

jest.mock("@/lib/api/common", () => ({
  isDevAgentMode: () => false,
}));

describe("BookStudioChapterEditor (WYSIWYG contract)", () => {
  const bookId = "demo-book";

  beforeEach(() => {
    jest.clearAllMocks();

    // Minimal fetch mocks for canonical + overlay downloads.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = jest.fn(async (url: any) => {
      const u = String(url || "");
      if (u.includes("canonical")) {
        return {
          ok: true,
          json: async () => ({
            meta: { title: "Demo Book", level: "n3" },
            chapters: [
              {
                title: "Chapter 1",
                sections: [
                  {
                    title: "1.1 Section",
                    content: [{ type: "paragraph", id: "p1", basis: "Hello", images: [] }],
                  },
                ],
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ paragraphs: [] }),
      };
    });

    callGet.mockImplementation(async (_method: string, params: Record<string, string>) => {
      const scope = params.scope;
      if (scope === "versions") {
        return { ok: true, scope, versions: [{ book_version_id: "bv1" }] };
      }
      if (scope === "overlays") {
        return { ok: true, scope, overlays: [{ id: "ov1", label: "Book Studio" }] };
      }
      return { ok: true, scope };
    });

    call.mockImplementation(async (method: string, params: Record<string, any>) => {
      if (method === "lms.bookVersionInputUrls") {
        return {
          ok: true,
          bookId,
          bookVersionId: "bv1",
          overlayId: params.overlayId ?? "ov1",
          urls: {
            canonical: { path: "x/canonical.json", signedUrl: "https://example.com/canonical.json" },
            overlay: { path: "x/overlay.json", signedUrl: "https://example.com/overlay.json" },
            figures: null,
            designTokens: null,
            assetsZip: null,
          },
          imageSrcMap: {},
          missingImageSrcs: [],
        };
      }
      if (method === "lms.bookLibraryImageUrl") {
        return {
          ok: true,
          bookId,
          urls: {
            __book_cover__: {
              storagePath: `library/${bookId}/images/cover.png`,
              signedUrl: "https://example.com/cover.png",
            },
          },
          missing: [],
          expiresIn: 3600,
        };
      }
      return { ok: true };
    });
  });

  it('calls bookVersionInputUrls with target="chapter" + includeChapterOpeners=true', async () => {
    const BookStudioChapterEditor = (await import("@/pages/admin/BookStudioChapterEditor")).default;

    render(
      <MemoryRouter initialEntries={[`/admin/book-studio/${bookId}/chapters/0`]}>
        <Routes>
          <Route path="/admin/book-studio/:bookId/chapters/:chapterIndex" element={<BookStudioChapterEditor />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(call).toHaveBeenCalled());

    expect(call).toHaveBeenCalledWith(
      "lms.bookVersionInputUrls",
      expect.objectContaining({
        bookId,
        target: "chapter",
        chapterIndex: 0,
        includeChapterOpeners: true,
        allowMissingImages: true,
      })
    );

    expect(call).toHaveBeenCalledWith(
      "lms.bookLibraryImageUrl",
      expect.objectContaining({
        bookId,
        canonicalSrcs: ["__book_cover__"],
      })
    );
  });

  it('clicking "Proof" triggers a runs lookup (bookList scope=runs)', async () => {
    const BookStudioChapterEditor = (await import("@/pages/admin/BookStudioChapterEditor")).default;

    render(
      <MemoryRouter initialEntries={[`/admin/book-studio/${bookId}/chapters/0`]}>
        <Routes>
          <Route path="/admin/book-studio/:bookId/chapters/:chapterIndex" element={<BookStudioChapterEditor />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(call).toHaveBeenCalledWith("lms.bookVersionInputUrls", expect.anything()));

    const proofBtn = await screen.findByRole("button", { name: "Proof" });
    fireEvent.click(proofBtn);

    await waitFor(() => {
      expect(callGet).toHaveBeenCalledWith(
        "lms.bookList",
        expect.objectContaining({
          scope: "runs",
          bookId,
        })
      );
    });
  });
});


