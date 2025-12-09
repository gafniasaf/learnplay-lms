/**
 * CourseCard Snapshot Tests
 * Tests component rendering to catch unintended UI changes
 */

import React from 'react';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { CourseCard } from '@/components/courses/CourseCard';

// Mock useAuth hook
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    role: 'student',
  }),
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('CourseCard Snapshot Tests', () => {
  const defaultCourse = {
    id: 'test-course-123',
    title: 'Test Course',
    subject: 'Mathematics',
    difficulty: 'middle' as const,
    published: true,
  };

  it('matches snapshot with default props', () => {
    const { container } = renderWithRouter(<CourseCard course={defaultCourse} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with unpublished course', () => {
    const { container } = renderWithRouter(
      <CourseCard course={{ ...defaultCourse, published: false }} />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with different difficulty', () => {
    const { container } = renderWithRouter(
      <CourseCard course={{ ...defaultCourse, difficulty: 'elementary' }} />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with long title', () => {
    const { container } = renderWithRouter(
      <CourseCard
        course={{
          ...defaultCourse,
          title: 'Very Long Course Title That Might Wrap to Multiple Lines',
        }}
      />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with skill focus', () => {
    const { container } = renderWithRouter(
      <CourseCard course={defaultCourse} skillFocus="skill-123" />
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

