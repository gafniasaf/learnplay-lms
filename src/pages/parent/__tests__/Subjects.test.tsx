import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Subjects from "@/pages/parent/Subjects";

const mockUseParentSubjects = jest.fn();

class MockResizeObserver {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  global.ResizeObserver = MockResizeObserver as any;
  window.ResizeObserver = MockResizeObserver as any;
});

jest.mock(
  "@/hooks/useParentSubjects",
  () => ({
    useParentSubjects: (...args: unknown[]) => mockUseParentSubjects(...args),
  }),
  { virtual: true }
);

jest.mock("@/lib/api", () => ({
  useMockData: () => false,
}));

describe("ParentSubjects", () => {
  beforeEach(() => {
    mockUseParentSubjects.mockReturnValue({
      data: {
        summary: {
          totalSubjects: 1,
          averageMastery: 68,
          subjectsWithAlerts: 0,
        },
        subjects: [
          {
            subject: "algebra-fundamentals",
            masteryPct: 68,
            trend: "up",
            alertFlag: false,
            totalSessions: 12,
            recentAccuracy: 76,
            previousAccuracy: 70,
            lastPracticedAt: new Date().toISOString(),
          },
        ],
        emptyState: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  afterEach(() => {
    mockUseParentSubjects.mockReset();
  });

  it("renders live subject performance data", async () => {
    const { findAllByText } = render(
      <MemoryRouter>
        <Subjects />
      </MemoryRouter>
    );

    const subjectNodes = await findAllByText(/Algebra Fundamentals/i);
    expect(subjectNodes.length).toBeGreaterThan(0);
  });
});


