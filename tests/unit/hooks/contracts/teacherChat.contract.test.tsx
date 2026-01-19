import { render, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";

const listRecords = jest.fn();
const teacherChatAssistant = jest.fn();
const saveRecord = jest.fn();

jest.mock("@/hooks/useMCP", () => ({
  useMCP: () => ({
    listRecords,
    teacherChatAssistant,
    saveRecord,
  }),
}));

const toastError = jest.fn();
const toastSuccess = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    error: (...args: any[]) => toastError(...args),
    success: (...args: any[]) => toastSuccess(...args),
  },
}));

// JSDOM crypto may not implement randomUUID; our pages rely on it.
let __uuidCounter = 0;
beforeAll(() => {
  const g: any = globalThis as any;
  if (!g.crypto) g.crypto = {};
  if (typeof g.crypto.randomUUID !== "function") {
    g.crypto.randomUUID = () => `test-uuid-${(__uuidCounter += 1)}`;
  }
});

describe("TeacherGPT Chat (contract)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listRecords.mockResolvedValue({ ok: true, records: [{ id: "mat-1", title: "Material 1" }] });
    teacherChatAssistant.mockResolvedValue({
      ok: true,
      answer: "Hi",
      citations: [],
      recommendations: [],
      requestId: "req-1",
    });
    saveRecord.mockResolvedValue({ ok: true, id: "lk-1" });
  });

  it("loads materials via listRecords on mount", async () => {
    const TeacherChat = (await import("@/pages/teacher/TeacherChat")).default;

    render(
      <MemoryRouter>
        <TeacherChat />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listRecords).toHaveBeenCalled());
    expect(listRecords).toHaveBeenCalledWith("library-material", 50);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("calls teacherChatAssistant with correct params when sending", async () => {
    const TeacherChat = (await import("@/pages/teacher/TeacherChat")).default;

    const { container } = render(
      <MemoryRouter>
        <TeacherChat />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listRecords).toHaveBeenCalled());

    const input = container.querySelector(
      '[data-cta-id="cta-teachergpt-chat-input"]',
    ) as HTMLInputElement | null;
    expect(input).toBeTruthy();
    fireEvent.change(input as HTMLInputElement, { target: { value: "Maak een lesplan voor B1-K2-W2" } });

    const send = container.querySelector(
      '[data-cta-id="cta-teachergpt-chat-send"]',
    ) as HTMLButtonElement | null;
    expect(send).toBeTruthy();
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(send as HTMLButtonElement);

    await waitFor(() => expect(teacherChatAssistant).toHaveBeenCalled());
    expect(teacherChatAssistant).toHaveBeenCalledWith({
      messages: [{ role: "user", content: "Maak een lesplan voor B1-K2-W2" }],
      scope: "all",
      materialId: undefined,
    });
  });

  it("selecting a recommendation updates scope + material selection", async () => {
    teacherChatAssistant.mockResolvedValue({
      ok: true,
      answer: "Hier zijn materialen",
      citations: [],
      recommendations: [
        {
          material_id: "mat-1",
          title: "SBAR template overdracht",
          score: 0.69,
          snippet: "Gebruik SBAR om overdracht te structureren.",
        },
      ],
      requestId: "req-2",
    });

    const TeacherChat = (await import("@/pages/teacher/TeacherChat")).default;
    const { container } = render(
      <MemoryRouter>
        <TeacherChat />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listRecords).toHaveBeenCalled());

    fireEvent.change(
      container.querySelector('[data-cta-id="cta-teachergpt-chat-input"]') as HTMLInputElement,
      { target: { value: "Zoek SBAR materiaal" } },
    );
    const send = container.querySelector(
      '[data-cta-id="cta-teachergpt-chat-send"]',
    ) as HTMLButtonElement;
    await waitFor(() => expect(send.disabled).toBe(false));
    fireEvent.click(send);

    await waitFor(() => expect(teacherChatAssistant).toHaveBeenCalled());

    fireEvent.click(
      container.querySelector('[data-cta-id="cta-teachergpt-chat-tab-materials"]') as HTMLButtonElement,
    );

    await waitFor(() =>
      expect(container.querySelector('[data-cta-id="cta-teachergpt-chat-recommendation-use"]')).toBeTruthy(),
    );

    fireEvent.click(
      container.querySelector('[data-cta-id="cta-teachergpt-chat-recommendation-use"]') as HTMLButtonElement,
    );

    fireEvent.click(
      container.querySelector('[data-cta-id="cta-teachergpt-chat-settings-toggle"]') as HTMLButtonElement,
    );

    const scopeSelect = container.querySelector(
      '[data-cta-id="cta-teachergpt-chat-settings-scope"]',
    ) as HTMLSelectElement;
    const materialSelect = container.querySelector(
      '[data-cta-id="cta-teachergpt-chat-settings-material-select"]',
    ) as HTMLSelectElement;

    expect(scopeSelect.value).toBe("materials");
    expect(materialSelect.value).toBe("mat-1");
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("persists lesson plan via saveRecord when clicking Gebruiken", async () => {
    teacherChatAssistant.mockResolvedValue({
      ok: true,
      answer: "Ik heb een lesplan opgesteld.",
      citations: [
        { source: "mes", course_id: "mes", item_index: 12, similarity: 0.91, text: "MES bron tekst" },
      ],
      recommendations: [],
      lessonPlan: {
        quickStart: {
          oneLiner: "SBAR overdracht oefenen in duo's",
          keyConcepts: ["SBAR", "overdracht"],
          timeAllocation: { start: 10, kern: 30, afsluiting: 10 },
        },
        teacherScript: [
          { time: "00:00–00:10", phase: "start", action: "intro", content: "Leg SBAR kort uit." },
        ],
        discussionQuestions: [
          { question: "Waarom is structuur belangrijk?", expectedAnswers: ["veiligheid", "duidelijkheid"] },
        ],
        groupWork: { title: "Rollenspel SBAR", steps: ["Kies rollen", "Oefen overdracht"], durationMinutes: 15 },
        kdAlignment: { code: "B1-K2-W2", title: "Werkt samen met andere zorgprofessionals" },
      },
      kdCheck: {
        code: "B1-K2-W2",
        items: [{ ok: true, text: "Professionele communicatie → SBAR-structuur" }],
        score: { passed: 1, total: 1 },
      },
      requestId: "req-3",
    });

    const TeacherChat = (await import("@/pages/teacher/TeacherChat")).default;
    const { container } = render(
      <MemoryRouter>
        <TeacherChat />
      </MemoryRouter>,
    );

    await waitFor(() => expect(listRecords).toHaveBeenCalled());

    fireEvent.change(
      container.querySelector('[data-cta-id="cta-teachergpt-chat-input"]') as HTMLInputElement,
      { target: { value: "Maak een lesplan voor B1-K2-W2" } },
    );
    const send = container.querySelector(
      '[data-cta-id="cta-teachergpt-chat-send"]',
    ) as HTMLButtonElement;
    await waitFor(() => expect(send.disabled).toBe(false));
    fireEvent.click(send);

    await waitFor(() => expect(teacherChatAssistant).toHaveBeenCalled());

    await waitFor(() =>
      expect(container.querySelector('[data-cta-id="cta-teachergpt-chat-lesplan-use"]')).toBeTruthy(),
    );
    fireEvent.click(
      container.querySelector('[data-cta-id="cta-teachergpt-chat-lesplan-use"]') as HTMLButtonElement,
    );

    await waitFor(() => expect(saveRecord).toHaveBeenCalled());
    expect(saveRecord).toHaveBeenCalledWith(
      "lesson-kit",
      expect.objectContaining({
        status: "draft",
        locale: "nl-NL",
        kit: expect.objectContaining({
          kind: "teachergpt_lesson_plan_v1",
        }),
      }),
    );
    expect(toastSuccess).toHaveBeenCalled();
  });
});

