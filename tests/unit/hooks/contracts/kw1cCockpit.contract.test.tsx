import { render, waitFor, fireEvent, screen } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";

const listClasses = jest.fn();
const listOrgStudents = jest.fn();
const listRecords = jest.fn();
const searchCuratedMaterials = jest.fn();

jest.mock("@/hooks/useMCP", () => ({
  useMCP: () => ({
    listClasses,
    listOrgStudents,
    listRecords,
    searchCuratedMaterials,
  }),
}));

// Kw1cCockpit imports the Vite Supabase client which relies on `import.meta`.
// In Jest (CJS) this would throw at parse-time, so we stub it.
jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "https://example.invalid" }, error: null }),
      }),
    },
  },
}));

const toastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    error: (...args: any[]) => toastError(...args),
  },
}));

describe("KW1C Cockpit (contract)", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    listClasses.mockResolvedValue({ classes: [] });
    listOrgStudents.mockResolvedValue({ students: [] });
    listRecords.mockResolvedValue({ ok: true, records: [] });
    searchCuratedMaterials.mockResolvedValue({ ok: true, results: [] });
  });

  it("loads overview via listClasses/listOrgStudents/listRecords on mount", async () => {
    const Kw1cCockpit = (await import("@/pages/teacher/Kw1cCockpit")).default;

    render(
      <MemoryRouter>
        <Kw1cCockpit />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listClasses).toHaveBeenCalled());

    expect(listClasses).toHaveBeenCalled();
    expect(listOrgStudents).toHaveBeenCalled();
    expect(listRecords).toHaveBeenCalledWith("library-material", 100);
    expect(listRecords).toHaveBeenCalledWith("standards-document", 100);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("calls searchCuratedMaterials with correct params when searching", async () => {
    const Kw1cCockpit = (await import("@/pages/teacher/Kw1cCockpit")).default;

    render(
      <MemoryRouter>
        <Kw1cCockpit />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listClasses).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText("bijv. COPD, zuurstof, WP2.3"), {
      target: { value: "  COPD zuurstof  " },
    });
    fireEvent.change(screen.getByPlaceholderText("bijv. WP2.3"), {
      target: { value: "  WP2.3  " },
    });

    // Type (select)
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "casus" } });

    // Language variant
    fireEvent.change(screen.getByLabelText("Taalvariant"), { target: { value: "ar" } });

    fireEvent.click(screen.getByRole("button", { name: "Zoeken" }));

    await waitFor(() => expect(searchCuratedMaterials).toHaveBeenCalled());

    expect(searchCuratedMaterials).toHaveBeenCalledWith({
      query: "COPD zuurstof",
      kd_code: "WP2.3",
      material_type: "casus",
      language_variant: "ar",
      limit: 20,
    });
  });
});

