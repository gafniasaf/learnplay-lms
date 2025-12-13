import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Courses from '@/pages/Courses';

// Mock API: first call returns one course, second call returns two
const getCourseCatalogMock = jest.fn();
jest.mock('@/lib/api', () => ({
  getCourseCatalog: () => getCourseCatalogMock(),
  searchCourses: jest.fn(),
}));

// Mock CourseCard to simplify DOM
jest.mock('@/components/courses/CourseCard', () => ({ CourseCard: ({ course }: any) => (
  <div data-testid='course-card'>{course.title}</div>
)}));

// Avoid realtime setup in unit tests
jest.mock('@/lib/env', () => {
  const actual = jest.requireActual('@/lib/env');
  return { ...actual, isLiveMode: () => false };
});

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Courses page - catalog-version-changed reload', () => {
  it('reloads catalog when catalog-version-changed event dispatches', async () => {
    getCourseCatalogMock
      .mockResolvedValueOnce({ courses: [{ id: 'a', title: 'A' }] })
      .mockResolvedValueOnce({ courses: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] });

    renderWithProviders(<Courses />);

    // First load shows one card
    const first = await screen.findAllByTestId('course-card');
    expect(first.length).toBe(1);

    // Dispatch version-changed event to trigger reload
    await act(async () => {
      window.dispatchEvent(new CustomEvent('catalog-version-changed', { detail: { etag: 'x' } }));
    });

    const cardsAfter = await screen.findAllByTestId('course-card');
    expect(cardsAfter.length).toBe(2);
  });
});
