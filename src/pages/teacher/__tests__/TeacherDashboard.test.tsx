import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeacherDashboard from '@/pages/teacher/TeacherDashboard';
import { useTeacherDashboard } from '@/hooks/useTeacherDashboard';

jest.mock('@/hooks/useTeacherDashboard', () => ({
  useTeacherDashboard: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  useMockData: () => false,
}));

jest.mock('@/components/teacher/AssignCourseModal', () => ({
  AssignCourseModal: () => null,
}));

const mockUseTeacherDashboard = useTeacherDashboard as jest.MockedFunction<typeof useTeacherDashboard>;

const queryClient = new QueryClient();

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <QueryClientProvider client={queryClient}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
);

describe('TeacherDashboard', () => {
  beforeEach(() => {
    mockUseTeacherDashboard.mockReturnValue({
      data: {
        assignments: [
          {
            id: 'assign-1',
            title: 'Live Algebra Assignment',
            course_id: 'algebra-101',
            due_at: '2025-11-10T00:00:00.000Z',
            created_at: '2025-10-31T12:00:00.000Z',
          },
        ],
        classes: [
          { id: 'class-1', name: 'Algebra 101', description: null, owner: 'teacher-1', org_id: 'org-1', created_at: '2025-10-01T00:00:00.000Z' },
        ],
        students: [
          { id: 'student-1', name: 'Alice Johnson', classIds: [] },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as any);
  });

  afterEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
  });

  it('renders assignments from the live teacher dashboard data', async () => {
    const { findByText, getByText } = render(<TeacherDashboard />, { wrapper: Wrapper });

    expect(await findByText('Live Algebra Assignment')).toBeInTheDocument();
    expect(getByText('algebra-101')).toBeInTheDocument();
  });
});
