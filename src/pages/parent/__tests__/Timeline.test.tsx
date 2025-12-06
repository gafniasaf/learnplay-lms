import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Timeline from "@/pages/parent/Timeline";
import { useParentTimeline } from "@/hooks/useParentTimeline";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ParentTimelineResponse } from "@/lib/api/parentTimeline";

jest.mock("@/hooks/useParentTimeline", () => ({
  useParentTimeline: jest.fn(),
}));

jest.mock("@/lib/api", () => ({
  useMockData: () => false,
}));

const mockUseParentTimeline = useParentTimeline as jest.MockedFunction<
  typeof useParentTimeline
>;

describe("ParentTimeline", () => {
  beforeEach(() => {
    const mockQueryResult = {
      data: {
        events: [
          {
            id: "evt-1",
            studentId: "student-1",
            studentName: "Alice Johnson",
            eventType: "assignment_completed",
            description: "Fractions Practice",
            metadata: {
              subject: "Fractions Practice",
              level: "Grade 4",
              items: 12,
              accuracyPct: 92,
              mistakes: 1,
              time_spent_minutes: 30,
            },
            occurredAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
        hasMore: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      dataUpdatedAt: Date.now(),
      errorUpdatedAt: 0,
      failureCount: 0,
      failureReason: null,
      fetchStatus: "idle",
      isFetched: true,
      isFetchedAfterMount: true,
      isFetching: false,
      isInitialLoading: false,
      isLoadingError: false,
      isPaused: false,
      isPlaceholderData: false,
      isPreviousData: false,
      isRefetchError: false,
      isRefetching: false,
      status: "success",
    } as unknown as UseQueryResult<ParentTimelineResponse>;

    mockUseParentTimeline.mockReturnValue(mockQueryResult);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders timeline events from API", async () => {
    const { findByText } = render(
      <MemoryRouter initialEntries={["/parent/timeline"]}>
        <Timeline />
      </MemoryRouter>
    );

    expect(
      await findByText(/Fractions Practice/i)
    ).toBeInTheDocument();
  });
});


