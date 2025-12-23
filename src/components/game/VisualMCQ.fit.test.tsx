import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VisualMCQ } from './VisualMCQ';

// Mock screen for testing
const screen = {
  getAllByRole: (role: string) => Array.from(document.querySelectorAll(`[role="${role}"]`)),
};

describe('VisualMCQ fit behavior', () => {
  const item = {
    id: 1,
    mode: 'visual-mcq' as const,
    stem: { text: 'Pick one' },
    options: [
      { text: 'A', image: 'https://example.com/a.jpg' },
      { text: 'B', image: 'https://example.com/b.jpg' },
    ],
    correctIndex: 0,
  };

  it('renders images with object-cover so they fill the option tile', () => {
    render(<VisualMCQ item={item} onSelect={() => {}} />);
    const imgs = screen.getAllByRole('img');
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img).toHaveClass('object-cover');
    }
  });
});
