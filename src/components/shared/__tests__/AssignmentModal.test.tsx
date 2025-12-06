import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

import { AssignmentModal } from '../AssignmentModal'

const renderWithProviders = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('AssignmentModal', () => {
  it('renders header', () => {
    renderWithProviders(
      <AssignmentModal
        isOpen
        onClose={() => {}}
        koId="ko1"
        assignerId="t1"
        assignerRole="teacher"
        contextId="class1"
      />
    )

    expect(screen.getByText(/assign practice/i)).toBeInTheDocument()
  })
})
