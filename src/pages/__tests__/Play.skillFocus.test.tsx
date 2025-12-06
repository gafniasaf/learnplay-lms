import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Play from '../../pages/Play';

jest.mock('@/lib/api', () => {
  const now = new Date().toISOString();
  const course = {
    id: 'course-test',
    title: 'Test Course',
    contentVersion: 'v1',
    levels: [{ id: 1, title: 'All', start: 1, end: 1 }],
    groups: [{ id: 1, name: 'G1' }],
    items: [
      {
        id: 1,
        groupId: 1,
        text: 'Q1',
        explain: '',
        clusterId: 'c1',
        variant: '1',
        mode: 'options',
        options: ['A'],
        correctIndex: 0,
        learningObjectiveId: 'ko-some-other',
      },
    ],
  };
  return {
    __esModule: true,
    getCourse: jest.fn().mockResolvedValue(course),
    startRound: jest.fn().mockResolvedValue({ roundId: 'r1', sessionId: 's1', startedAt: now }),
    logAttemptLive: jest.fn().mockResolvedValue({ attemptId: 'a1', roundId: 'r1' }),
    getApiMode: jest.fn().mockReturnValue('mock'),
  };
});

jest.mock('@/lib/api/knowledgeMap', () => ({
  __esModule: true,
  getKnowledgeObjective: jest.fn().mockResolvedValue({ id: 'ko-abc', name: 'Test Skill' }),
}));

// Basic smoke test: when skillFocus has no matching items in the course,
// Play should render the fallback link to recommended courses.

describe('Play skillFocus smoke', () => {
  it('shows fallback link when no items match skill focus', async () => {
    const initialEntry = '/play/course-test?skillFocus=ko-abc'; // ko-abc does not match course items

    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/play/:courseId" element={<Play />} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for course load
    await waitFor(() => expect(screen.getByText(/Loading course/i)).toBeInTheDocument(), { timeout: 500 });

    // After load, the Skill chip should show the KO name
    expect(await screen.findByText(/Skill:\s*Test Skill/i)).toBeInTheDocument();

    // And the fallback link to recommended courses should appear (no matching items in course)
    const link = await screen.findByRole('button', { name: /see recommended courses/i });
    expect(link).toBeInTheDocument();
  });
});
