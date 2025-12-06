import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { OptionGrid } from './OptionGrid';

// Mock screen for testing
const screen = {
  getByRole: (role: string) => document.querySelector(`[role="${role}"]`),
  getAllByRole: (role: string) => Array.from(document.querySelectorAll(`[role="${role}"]`)),
  getByText: (text: string | RegExp) => {
    const elements = Array.from(document.querySelectorAll('*'));
    return elements.find(el => typeof text === 'string' ? el.textContent === text : text.test(el.textContent || ''));
  },
  getByAltText: (altText: string) => {
    const elements = Array.from(document.querySelectorAll('img'));
    return elements.find(el => el.getAttribute('alt') === altText);
  }
};

describe('OptionGrid smart-fit', () => {
  const onSelect = jest.fn();

  it('uses object-contain when image ratio deviates significantly from 16:9 (square image)', () => {
    render(
      <OptionGrid
        options={[""]}
        onSelect={onSelect}
        optionMedia={[{ type: 'image', url: 'https://example.com/square.jpg', width: 1000, height: 1000 } as any]}
        itemId={1}
        clusterId="c1"
        variant="v1"
      />
    );

    const img = screen.getByAltText('Option 1');
    expect(img).toHaveClass('object-contain');
  });

  it('uses object-cover when image ratio is ~16:9', () => {
    render(
      <OptionGrid
        options={[""]}
        onSelect={onSelect}
        optionMedia={[{ type: 'image', url: 'https://example.com/wide.jpg', width: 1600, height: 900 } as any]}
        itemId={2}
        clusterId="c2"
        variant="v2"
      />
    );

    const img = screen.getByAltText('Option 1');
    expect(img).toHaveClass('object-cover');
  });

  it('honors explicit fitMode override on media object', () => {
    render(
      <OptionGrid
        options={[""]}
        onSelect={onSelect}
        optionMedia={[{ type: 'image', url: 'https://example.com/wide.jpg', width: 1600, height: 900, fitMode: 'contain' } as any]}
        itemId={3}
        clusterId="c3"
        variant="v3"
      />
    );

    const img = screen.getByAltText('Option 1');
    expect(img).toHaveClass('object-contain');
  });
});
