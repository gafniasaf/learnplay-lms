import { render, waitFor, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("BookVersionDetail (contract)", () => {
  const bookId = "demo-book";
  const bookVersionId = "demo-version-hash";

  beforeEach(() => {
    jest.clearAllMocks();

    callGet.mockImplementation(async (_method: string, params: Record<string, string>) => {
      const scope = params.scope;
      if (scope === "versions") {
        return {
          ok: true,
          scope,
          versions: [
            {
              id: "row-1",
              book_id: bookId,
              book_version_id: bookVersionId,
              schema_version: "1.0",
              canonical_path: `${bookId}/${bookVersionId}/canonical.json`,
              figures_path: null,
              design_tokens_path: null,
              status: "ready",
            },
          ],
          total: 1,
          limit: 200,
          offset: 0,
        };
      }
      if (scope === "runs") return { ok: true, scope, runs: [], total: 0, limit: 200, offset: 0 };
      if (scope === "overlays") return { ok: true, scope, overlays: [], total: 0, limit: 200, offset: 0 };
      if (scope === "links") return { ok: true, scope, links: [], total: 0, limit: 200, offset: 0 };
      return { ok: true, scope };
    });

    call.mockResolvedValue({ ok: true, runId: "run-123" });
  });

  it('loads via callGet("lms.bookList") across versions/runs/overlays/links', async () => {
    const BookVersionDetail = (await import("@/pages/admin/BookVersionDetail")).default;

    render(
      <MemoryRouter initialEntries={[`/admin/books/${bookId}/versions/${bookVersionId}`]}>
        <Routes>
          <Route path="/admin/books/:bookId/versions/:bookVersionId" element={<BookVersionDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(callGet).toHaveBeenCalled());

    expect(callGet).toHaveBeenCalledWith("lms.bookList", {
      scope: "versions",
      bookId,
      limit: "200",
      offset: "0",
    });
    expect(callGet).toHaveBeenCalledWith("lms.bookList", {
      scope: "runs",
      bookId,
      bookVersionId,
      limit: "200",
      offset: "0",
    });
    expect(callGet).toHaveBeenCalledWith("lms.bookList", {
      scope: "overlays",
      bookId,
      bookVersionId,
      limit: "200",
      offset: "0",
    });
    expect(callGet).toHaveBeenCalledWith("lms.bookList", {
      scope: "links",
      bookId,
      bookVersionId,
      limit: "200",
      offset: "0",
    });
  });

  it('enqueues a full-book render via call("lms.bookEnqueueRender")', async () => {
    const BookVersionDetail = (await import("@/pages/admin/BookVersionDetail")).default;
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={[`/admin/books/${bookId}/versions/${bookVersionId}`]}>
        <Routes>
          <Route path="/admin/books/:bookId/versions/:bookVersionId" element={<BookVersionDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(callGet).toHaveBeenCalled());

    const renderBookButton = await screen.findByRole("button", { name: /render full book/i });
    await user.click(renderBookButton);

    await waitFor(() => expect(call).toHaveBeenCalled());
    expect(call).toHaveBeenCalledWith(
      "lms.bookEnqueueRender",
      expect.objectContaining({
        bookId,
        bookVersionId,
        target: "book",
        renderProvider: "prince_local",
      })
    );
  });
});


