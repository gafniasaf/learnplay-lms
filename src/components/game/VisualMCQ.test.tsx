import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VisualMCQ } from './VisualMCQ';

describe('VisualMCQ', () => {
  const mockItem = {
    id: 1,
    mode: 'visual-mcq' as const,
    stem: { text: 'Which animal is a mammal?' },
    options: [
      { text: 'Dog', image: '/images/dog.jpg' },
      { text: 'Snake', image: '/images/snake.jpg' },
      { text: 'Eagle', image: '/images/eagle.jpg' },
      { text: 'Shark', image: '/images/shark.jpg' },
    ],
    correctIndex: 0,
  };

  it('renders stem text', () => {
    const { container } = render(<VisualMCQ item={mockItem} onSelect={() => {}} />);
    expect(container.textContent).toMatch(/Which animal is a mammal/i);
  });

  it('renders image options in grid', () => {
    const { container } = render(<VisualMCQ item={mockItem} onSelect={() => {}} />);
    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(4);
    expect(images[0]).toHaveAttribute('alt', 'Dog');
  });

  it('renders option labels below images', () => {
    const { container } = render(<VisualMCQ item={mockItem} onSelect={() => {}} />);
    expect(container.textContent).toContain('Dog');
    expect(container.textContent).toContain('Snake');
  });

  it('calls onSelect with correct index when option clicked', () => {
    const onSelect = jest.fn();
    const { container } = render(<VisualMCQ item={mockItem} onSelect={onSelect} />);
    
    const buttons = container.querySelectorAll('button');
    buttons[1].click(); // Click "Snake" (index 1)
    
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});

