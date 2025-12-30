import { render, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";

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

describe("BooksLibrary (contract)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    callGet.mockResolvedValue({
      ok: true,
      scope: "books",
      books: [],
      total: 0,
      limit: 50,
      offset: 0,
    });
  });

  it('calls callGet("lms.bookList") with scope=books on mount', async () => {
    const BooksLibrary = (await import("@/pages/admin/BooksLibrary")).default;

    render(
      <MemoryRouter>
        <BooksLibrary />
      </MemoryRouter>
    );

    await waitFor(() => expect(callGet).toHaveBeenCalled());

    expect(callGet).toHaveBeenCalledWith("lms.bookList", {
      scope: "books",
      limit: "50",
      offset: "0",
    });
  });
});


