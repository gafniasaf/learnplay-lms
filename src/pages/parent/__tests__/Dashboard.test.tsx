import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ParentDashboard from "@/pages/parent/Dashboard";

const mockUseParentDashboard = jest.fn();
const mockUseParentRange = jest.fn();
const mockUseParentSubjects = jest.fn();
const mockUseParentTimeline = jest.fn();
const mockUseParentGoals = jest.fn();
const mockUseParentTopics = jest.fn();

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

jest.mock("@/hooks/useParentDashboard", () => ({
  useParentDashboard: (...args: unknown[]) => mockUseParentDashboard(...args),
}));

jest.mock("@/hooks/useParentRange", () => ({
  useParentRange: (...args: unknown[]) => mockUseParentRange(...args),
}));

jest.mock("@/hooks/useParentSubjects", () => ({
  useParentSubjects: (...args: unknown[]) => mockUseParentSubjects(...args),
}));

jest.mock("@/hooks/useParentTimeline", () => ({
  useParentTimeline: (...args: unknown[]) => mockUseParentTimeline(...args),
}));

jest.mock("@/hooks/useParentGoals", () => ({
  useParentGoals: (...args: unknown[]) => mockUseParentGoals(...args),
}));

jest.mock("@/hooks/useParentTopics", () => ({
  useParentTopics: (...args: unknown[]) => mockUseParentTopics(...args),
}));

describe("ParentDashboard", () => {
  beforeEach(() => {
    mockUseParentDashboard.mockReturnValue({
      data: {
        parentId: "parent-1",
        parentName: "Jordan Parent",
        summary: {
          totalChildren: 2,
          totalAlerts: 3,
          averageStreak: 5,
          totalXp: 4200,
        },
        children: [
          {
            studentId: "child-1",
            studentName: "Ava",
            linkStatus: "active",
            linkedAt: new Date().toISOString(),
            metrics: {
              streakDays: 6,
              xpTotal: 2500,
              lastLoginAt: new Date().toISOString(),
              recentActivityCount: 4,
            },
            upcomingAssignments: {
              count: 1,
              items: [
                {
                  id: "assign-1",
                  title: "Fractions Practice",
                  courseId: "math",
                  dueAt: new Date().toISOString(),
                  status: "in_progress",
                  progressPct: 40,
                },
              ],
            },
            alerts: {
              overdueAssignments: 1,
              goalsBehind: 0,
              needsAttention: true,
            },
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    mockUseParentRange.mockReturnValue({
      range: "week",
      setRange: jest.fn(),
      window: {
        startDate: new Date(),
        endDate: new Date(),
      },
    });

    mockUseParentSubjects.mockReturnValue({
      data: {
        subjects: [
          {
            subject: "math",
            masteryPct: 80,
            trend: "up",
            alertFlag: true,
            totalSessions: 10,
            recentAccuracy: 88,
            previousAccuracy: 84,
            lastPracticedAt: new Date().toISOString(),
            statusLabel: "Needs Review",
            statusKey: "review",
            normalizedSubject: "Math",
            status: "review",
            recommendedAction: "review",
          },
        ],
        summary: {
          totalSubjects: 1,
          averageMastery: 80,
          subjectsWithAlerts: 1,
        },
        emptyState: false,
      },
      isLoading: false,
      isError: false,
    });

    mockUseParentTimeline.mockReturnValue({
      data: {
        events: [
          {
            id: "evt-1",
            studentId: "child-1",
            studentName: "Ava",
            eventType: "assignment_completed",
            description: "Fractions Practice",
            metadata: {},
            occurredAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
        hasMore: false,
      },
      isLoading: false,
      isError: false,
    });

    mockUseParentGoals.mockReturnValue({
      data: {
        goals: [
          {
            id: "goal-1",
            studentId: "child-1",
            studentName: "Ava",
            title: "Complete 5 rounds",
            targetMinutes: 60,
            progressMinutes: 45,
            progressPct: 75,
            dueAt: new Date().toISOString(),
            status: "on_track",
            teacherNote: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            daysRemaining: 2,
            isOverdue: false,
          },
        ],
        summary: {
          totalGoals: 1,
          onTrack: 1,
          behind: 0,
          completed: 0,
          overdue: 0,
          averageProgress: 75,
        },
        emptyState: false,
      },
      isLoading: false,
      isError: false,
    });

    mockUseParentTopics.mockReturnValue({
      data: {
        topics: [
          {
            topic: "fractions_practice",
            subject: "math",
            accuracyPct: 55,
            attempts: 10,
            correctCount: 5,
            lastPracticedAt: new Date().toISOString(),
            recommendedAction: "review",
            actionMessage: "Needs review",
          },
          {
            topic: "equivalent_fractions",
            subject: "math",
            accuracyPct: 88,
            attempts: 12,
            correctCount: 10,
            lastPracticedAt: new Date().toISOString(),
            recommendedAction: "maintain",
            actionMessage: "Keep practicing",
          },
        ],
        summary: {
          totalTopics: 2,
          averageAccuracy: 72,
          topicsNeedingReview: 1,
          topicsForPractice: 0,
          topicsMastered: 0,
        },
        emptyState: false,
        message: null,
      },
      isLoading: false,
      isError: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders live dashboard data for parent role", async () => {
    const { findByText, getByText, findAllByText, getAllByText } = render(
      <MemoryRouter>
        <ParentDashboard />
      </MemoryRouter>
    );

    expect(await findByText(/Hello, Jordan Parent/i)).toBeInTheDocument();
    expect(getByText(/Children Linked/i)).toBeInTheDocument();
    expect(getByText(/Ava/)).toBeInTheDocument();
    const timelineEntries = await findAllByText(/Fractions Practice/i);
    expect(timelineEntries.length).toBeGreaterThan(0);
    expect(await findByText(/Equivalent Fractions/i)).toBeInTheDocument();
    expect(getByText(/1 subject needs review/i)).toBeInTheDocument();
    expect(getByText(/1 topic needs review/i)).toBeInTheDocument();
    const mathSubjects = getAllByText(/Math/i);
    expect(mathSubjects.length).toBeGreaterThan(0);
  });
});
