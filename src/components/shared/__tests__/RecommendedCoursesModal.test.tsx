import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

import { RecommendedCoursesModal } from '../RecommendedCoursesModal'

// Mock module used by the modal's internal mock loader
jest.mock('@/lib/mocks/knowledgeMockData', () => ({
  MOCK_KNOWLEDGE_OBJECTIVES: [{ id: 'ko1', name: 'KO One', description: 'desc' }],
  getRecommendedCoursesForKO: jest.fn().mockReturnValue([
    { courseId: 'c1', courseTitle: 'Course 1', exerciseCount: 10, lastPracticed: undefined, completionPct: 0, relevance: 0.9 },
  ]),
}))

const renderWithProviders = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>
  )
}

describe('RecommendedCoursesModal', () => {
  it('renders course from mocked data', () => {
    renderWithProviders(
      <RecommendedCoursesModal koId="ko1" studentId="s1" isOpen onClose={() => {}} />
    )

    expect(screen.getByText(/course 1/i)).toBeInTheDocument()
    expect(screen.getByText(/cancel/i)).toBeInTheDocument()
  })
})
