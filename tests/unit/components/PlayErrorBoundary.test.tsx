/**
 * PlayErrorBoundary Component Tests
 * Tests error boundary component for error handling
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlayErrorBoundary } from '@/components/game/PlayErrorBoundary';
import * as Sentry from '@sentry/react';

// Mock Sentry
jest.mock('@sentry/react', () => ({
  captureException: jest.fn(),
}));

// Component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

describe('PlayErrorBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console.error for error boundary tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders children when no error occurs', () => {
    render(
      <PlayErrorBoundary>
        <div>Test content</div>
      </PlayErrorBoundary>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('catches errors and displays error UI', () => {
    render(
      <PlayErrorBoundary>
        <ThrowError shouldThrow={true} />
      </PlayErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/The game encountered an unexpected error/)).toBeInTheDocument();
  });

  it('logs error to Sentry', () => {
    render(
      <PlayErrorBoundary>
        <ThrowError shouldThrow={true} />
      </PlayErrorBoundary>
    );

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        contexts: expect.objectContaining({
          react: expect.objectContaining({
            componentStack: expect.any(String),
          }),
        }),
        tags: {
          errorBoundary: 'PlayErrorBoundary',
        },
      })
    );
  });

  it('shows error message in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    render(
      <PlayErrorBoundary>
        <ThrowError shouldThrow={true} />
      </PlayErrorBoundary>
    );

    expect(screen.getByText('Test error')).toBeInTheDocument();

    process.env.NODE_ENV = originalEnv;
  });

  it('hides error message in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    render(
      <PlayErrorBoundary>
        <ThrowError shouldThrow={true} />
      </PlayErrorBoundary>
    );

    expect(screen.queryByText('Test error')).not.toBeInTheDocument();

    process.env.NODE_ENV = originalEnv;
  });

  it('calls onReset when Try Again is clicked', () => {
    const onReset = jest.fn();

    render(
      <PlayErrorBoundary onReset={onReset}>
        <ThrowError shouldThrow={true} />
      </PlayErrorBoundary>
    );

    const tryAgainButton = screen.getByText('Try Again');
    fireEvent.click(tryAgainButton);

    expect(onReset).toHaveBeenCalled();
  });

  // Note: Testing error boundary reset requires complex React component lifecycle testing
  // The reset functionality is verified by the onReset callback being called
  // Full reset behavior should be tested via E2E tests

  it('navigates to home when Return Home is clicked', () => {
    delete (window as any).location;
    (window as any).location = { href: '' };

    render(
      <PlayErrorBoundary>
        <ThrowError shouldThrow={true} />
      </PlayErrorBoundary>
    );

    const homeButton = screen.getByText('Return Home');
    fireEvent.click(homeButton);

    expect(window.location.href).toBe('/');
  });

  it('displays support message', () => {
    render(
      <PlayErrorBoundary>
        <ThrowError shouldThrow={true} />
      </PlayErrorBoundary>
    );

    expect(screen.getByText(/If this problem persists, please contact support/)).toBeInTheDocument();
  });
});

