import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Goals from "@/pages/parent/Goals";

type MockGoal = {
  id: string;
  studentId: string;
  studentName: string;
  title: string;
  targetMinutes: number;
  progressMinutes: number;
  progressPct: number;
  dueAt: string | null;
  status: "on_track" | "behind" | "completed";
  teacherNote: string | null;
  createdAt: string;
  updatedAt: string;
  daysRemaining: number | null;
  isOverdue: boolean;
};

type MockSummary = {
  totalGoals: number;
  onTrack: number;
  behind: number;
  completed: number;
  overdue: number;
  averageProgress: number;
};

const mockUseParentGoals = jest.fn();

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
  "@/hooks/useParentGoals",
  () => ({
    useParentGoals: (...args: unknown[]) => mockUseParentGoals(...args),
  }),
  { virtual: true }
);

jest.mock("@/lib/api", () => ({
  useMockData: () => false,
}));

describe("ParentGoals", () => {
  const goals: MockGoal[] = [
    {
      id: "00000000-0000-0000-0000-000000000401",
      studentId: "student-1",
      studentName: "Alice",
      title: "Complete 5 rounds",
      targetMinutes: 60,
      progressMinutes: 45,
      progressPct: 75,
      dueAt: new Date().toISOString(),
      status: "on_track",
      teacherNote: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      daysRemaining: 3,
      isOverdue: false,
    },
    {
      id: "00000000-0000-0000-0000-000000000402",
      studentId: "student-1",
      studentName: "Alice",
      title: "Practice 60 minutes",
      targetMinutes: 90,
      progressMinutes: 30,
      progressPct: 33,
      dueAt: new Date().toISOString(),
      status: "behind",
      teacherNote: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      daysRemaining: 1,
      isOverdue: false,
    },
  ];

  const summary: MockSummary = {
    totalGoals: 2,
    onTrack: 1,
    behind: 1,
    completed: 0,
    overdue: 0,
    averageProgress: 54,
  };

  beforeEach(() => {
    mockUseParentGoals.mockReturnValue({
      data: { goals, summary, emptyState: false },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  afterEach(() => {
    mockUseParentGoals.mockReset();
  });

  it("renders goals returned from the API", async () => {
    const { findAllByText, getByText } = render(
      <MemoryRouter>
        <Goals />
      </MemoryRouter>
    );

    const rows = await findAllByText(/Complete 5 rounds/i);
    expect(rows.length).toBeGreaterThan(0);
    expect(getByText(/Average progress/i)).toBeInTheDocument();
  });
});
