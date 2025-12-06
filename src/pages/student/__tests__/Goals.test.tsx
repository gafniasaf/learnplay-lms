import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentGoals from '@/pages/student/Goals';
import { useStudentGoals } from '@/hooks/useStudentGoals';

jest.mock('@/hooks/useStudentGoals', () => ({
  useStudentGoals: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  useMockData: () => false,
}));

const mockUseStudentGoals = useStudentGoals as jest.MockedFunction<typeof useStudentGoals>;

describe('StudentGoals', () => {
  beforeEach(() => {
    mockUseStudentGoals.mockReturnValue({
      data: {
        goals: [
          {
            id: 'goal-1',
            studentId: 'student-1',
            title: 'Read 30 minutes',
            targetMinutes: 120,
            progressMinutes: 90,
            dueAt: '2025-11-05T00:00:00.000Z',
            status: 'on_track',
            teacherNote: null,
            createdAt: '2025-10-31T12:00:00.000Z',
            updatedAt: '2025-10-31T12:00:00.000Z',
          },
          {
            id: 'goal-2',
            studentId: 'student-1',
            title: 'Complete 5 practice sets',
            targetMinutes: 60,
            progressMinutes: 60,
            dueAt: '2025-11-03T00:00:00.000Z',
            status: 'completed',
            teacherNote: null,
            createdAt: '2025-10-30T12:00:00.000Z',
            updatedAt: '2025-10-30T12:00:00.000Z',
          },
        ],
        summary: {
          total: 2,
          onTrack: 1,
          behind: 0,
          completed: 1,
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      dataUpdatedAt: Date.now(),
      errorUpdatedAt: 0,
      failureCount: 0,
      failureReason: null,
      fetchStatus: 'idle',
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
      isStale: false,
      status: 'success',
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('surfaces live goal progress from the API', async () => {
    const { findByText, getByText } = render(
      <MemoryRouter>
        <StudentGoals />
      </MemoryRouter>
    );

    expect(await findByText(/90 \/ 120 min/)).toBeInTheDocument();
    expect(getByText(/1 \/ 2 items/)).toBeInTheDocument();
  });
});
