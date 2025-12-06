import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDashboard } from '@/hooks/useDashboard';
import StudentDashboard from '@/pages/student/Dashboard';

jest.mock('@/lib/api', () => ({
  useMockData: () => true,
}));

jest.mock('@/lib/api/assignments', () => ({
  listAssignmentsForStudent: jest.fn().mockResolvedValue({
    assignments: [],
    scope: 'student',
  }),
}));

jest.mock('@/components/student/StudentAssignments', () => ({
  StudentAssignments: () => null,
}));

jest.mock('@/lib/env', () => ({
  isLiveMode: () => true,
  getApiMode: () => 'live',
  forceSameOriginPreview: () => false,
  useStorageReads: () => false,
  isDevEnabled: () => false,
  setDevEnabled: () => undefined,
  onDevChange: () => () => undefined,
  clearModeOverride: () => undefined,
  setAllowedOrigins: () => undefined,
  getEmbedAllowedOrigins: () => [],
  getAllowedOrigins: () => [],
}));

jest.mock('@/hooks/useDashboard', () => ({
  useDashboard: jest.fn(),
}));

const mockUseDashboard = useDashboard as jest.MockedFunction<typeof useDashboard>;

const renderComponent = () => {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <StudentDashboard />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('StudentDashboard', () => {
  beforeEach(() => {
    mockUseDashboard.mockReturnValue({
      dashboard: {
        role: 'student',
        userId: 'student-1',
        displayName: 'Test Student',
        stats: {
          coursesInProgress: 1,
          coursesCompleted: 2,
          totalPoints: 120,
          currentStreak: 4,
          bestStreak: 7,
          accuracyRate: 88,
        },
        upcoming: [
          {
            id: 'assign-1',
            title: 'API Assignment',
            type: 'math',
            dueDate: '2025-11-10T12:00:00.000Z',
            progress: 0,
          },
        ],
        recent: [],
        achievements: [],
      },
      loading: false,
      error: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders next assignment from dashboard data', async () => {
    const { findByText } = renderComponent();

    expect(await findByText('API Assignment')).toBeInTheDocument();
  });
});


