import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentTimeline from '@/pages/student/Timeline';
import { useStudentTimeline } from '@/hooks/useStudentTimeline';

jest.mock('@/hooks/useStudentTimeline', () => ({
  useStudentTimeline: jest.fn(),
}));

jest.mock('@/hooks/useStudentRange', () => ({
  useStudentRange: () => ({
    window: {
      start: new Date('2025-10-01T00:00:00.000Z'),
      end: new Date('2025-11-01T00:00:00.000Z'),
    },
  }),
}));

jest.mock('@/lib/api', () => ({
  useMockData: () => false,
}));

const mockUseStudentTimeline = useStudentTimeline as jest.MockedFunction<typeof useStudentTimeline>;

describe('StudentTimeline', () => {
  beforeEach(() => {
    mockUseStudentTimeline.mockReturnValue({
      data: {
        events: [
          {
            id: 'evt-1',
            studentId: 'student-1',
            eventType: 'practice',
            description: 'Fractions practice',
            occurredAt: '2025-10-30T10:00:00.000Z',
            metadata: {
              subject: 'API Session',
              startISO: '2025-10-30T10:00:00.000Z',
              endISO: '2025-10-30T10:30:00.000Z',
              items: 18,
              accuracy_pct: 88,
            },
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

  it('renders sessions from live timeline data', async () => {
    const { findByText } = render(
      <MemoryRouter>
        <StudentTimeline />
      </MemoryRouter>
    );

    expect(await findByText('API Session')).toBeInTheDocument();
  });
});
