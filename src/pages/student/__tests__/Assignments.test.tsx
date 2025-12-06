import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentAssignments from '@/pages/student/Assignments';
import { useStudentAssignments } from '@/hooks/useStudentAssignments';

jest.mock('@/hooks/useStudentAssignments', () => ({
  useStudentAssignments: jest.fn(),
}));

jest.mock('@/lib/api/common', () => ({
  shouldUseMockData: () => false,
}));

const mockUseStudentAssignments = useStudentAssignments as jest.MockedFunction<typeof useStudentAssignments>;

describe('StudentAssignments', () => {
  beforeEach(() => {
    mockUseStudentAssignments.mockReturnValue({
      data: {
        assignments: [
          {
            id: 'assign-1',
            title: 'API Algebra Quiz',
            course_id: 'algebra-101',
            due_at: '2025-11-05T00:00:00.000Z',
          },
        ],
        scope: 'student',
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders assignments from the live API response', async () => {
    const { findByText, getByRole } = render(
      <MemoryRouter>
        <StudentAssignments />
      </MemoryRouter>
    );

    expect(await findByText('API Algebra Quiz')).toBeInTheDocument();
    expect(getByRole('link', { name: /Start API Algebra Quiz/i })).toBeInTheDocument();
  });
});
