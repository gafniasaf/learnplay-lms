/**
 * GameSidebar Snapshot Tests
 * Tests component rendering to catch unintended UI changes
 */

import React from 'react';
import { render } from '@testing-library/react';
import { GameSidebar } from '@/components/game/GameSidebar';

// Mock StudyTextsDrawer
jest.mock('@/components/learning/StudyTextsDrawer', () => ({
  StudyTextsDrawer: () => <div data-testid="study-texts-drawer">Study Texts</div>,
}));

// Mock isDevEnabled
jest.mock('@/lib/env', () => ({
  isDevEnabled: () => false,
}));

describe('GameSidebar Snapshot Tests', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    courseTitle: 'Test Course',
    currentLevel: 1,
    levels: [
      { id: 1, title: 'Level 1' },
      { id: 2, title: 'Level 2' },
    ],
    onLevelChange: jest.fn(),
    levelChangeDisabled: false,
    dataSource: 'live' as const,
    studyTexts: [],
    currentItemRelatedIds: [],
    score: 10,
    mistakes: 2,
    itemsRemaining: 5,
    elapsedTime: 120,
    ttsEnabled: false,
    hasTTS: true,
    onToggleTTS: jest.fn(),
    categoryMode: false,
    onToggleCategoryMode: jest.fn(),
    onExit: jest.fn(),
  };

  it('matches snapshot when sidebar is open', () => {
    const { container } = render(<GameSidebar {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when sidebar is closed', () => {
    const { container } = render(<GameSidebar {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with high score', () => {
    const { container } = render(
      <GameSidebar {...defaultProps} score={100} mistakes={0} />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with TTS enabled', () => {
    const { container } = render(
      <GameSidebar {...defaultProps} ttsEnabled={true} />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with category mode enabled', () => {
    const { container } = render(
      <GameSidebar {...defaultProps} categoryMode={true} />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with level change disabled', () => {
    const { container } = render(
      <GameSidebar {...defaultProps} levelChangeDisabled={true} />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with no levels', () => {
    const { container } = render(
      <GameSidebar {...defaultProps} levels={undefined} />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with study texts', () => {
    const { container } = render(
      <GameSidebar
        {...defaultProps}
        studyTexts={[
          { id: 1, title: 'Study Text 1', content: 'Content 1' },
          { id: 2, title: 'Study Text 2', content: 'Content 2' },
        ]}
      />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with mock data source', () => {
    const { container } = render(
      <GameSidebar {...defaultProps} dataSource="mock" />
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});


