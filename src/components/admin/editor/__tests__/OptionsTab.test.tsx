import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { OptionsTab } from '../OptionsTab';
import type { EditorItem } from '@/lib/editor/types';

// Mock screen for testing  
const screen = {
  getByRole: (role: string, options?: { name?: RegExp }) => {
    if (options?.name) {
      const elements = Array.from(document.querySelectorAll('[role]'));
      return elements.find(el => 
        el.getAttribute('role') === role && 
        options.name?.test(el.getAttribute('title') || el.textContent || '')
      );
    }
    return document.querySelector(`[role="${role}"]`);
  }
};

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('@/lib/logging', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

describe('OptionsTab toggles', () => {
  test('toggles media layout and fit for option media', async () => {
    const user = userEvent.setup();

    const baseItem: EditorItem = {
      options: ['Option A'],
      correctIndex: 0,
      optionMedia: [{ type: 'image', url: 'https://example.com/a.png' }],
    };

    const onChange = jest.fn();

    render(
      <OptionsTab
        item={baseItem}
        onChange={onChange}
        courseId="c1"
        course={{ title: 'T', subject: 'S', gradeBand: 'G' }}
      />
    );

    // Layout toggle
    const layoutBtn = screen.getByRole('button', { name: /layout:/i });
    await user.click(layoutBtn);
    expect(onChange).toHaveBeenCalled();
    const firstArg = onChange.mock.calls[0][0] as EditorItem;
    expect(firstArg.optionMedia?.[0] && (firstArg.optionMedia[0].type === 'image' || firstArg.optionMedia[0].type === 'video') ? firstArg.optionMedia[0].mediaLayout : undefined).toBe('thumbnail');

  });
});
