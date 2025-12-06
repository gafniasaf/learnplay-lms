import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Topics from "@/pages/parent/Topics";

const mockUseParentDashboard = jest.fn();
const mockUseParentTopics = jest.fn();

jest.mock("@/hooks/useParentDashboard", () => ({
  useParentDashboard: (...args: unknown[]) => mockUseParentDashboard(...args),
}));

jest.mock("@/hooks/useParentTopics", () => ({
  useParentTopics: (...args: unknown[]) => mockUseParentTopics(...args),
}));

jest.mock("@/lib/api", () => ({
  useMockData: () => false,
}));

describe("ParentTopics page", () => {
  beforeEach(() => {
    mockUseParentDashboard.mockReturnValue({
      data: {
        children: [
          {
            studentId: "child-1",
            studentName: "Ava",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    mockUseParentTopics.mockReturnValue({
      data: {
        studentId: "child-1",
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
      },
      isLoading: false,
      isError: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders parent topics from API", async () => {
    const { findByText, getByText } = render(
      <MemoryRouter>
        <Topics />
      </MemoryRouter>
    );

    expect(await findByText(/Topics Overview/i)).toBeInTheDocument();
    expect(getByText(/Fractions Practice/i)).toBeInTheDocument();
    expect(getByText(/1 topic needs review/i)).toBeInTheDocument();
  });
});
