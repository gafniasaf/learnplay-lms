import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// TDD: component does not exist yet; this test should fail first
import { ImageGenerateButton } from '../ImageGenerateButton';

describe('ImageGenerateButton', () => {
  const originalFetch = global.fetch as any;
  beforeEach(() => {
    (global as any).fetch = jest.fn(async (url: any, init: any) => {
      if (String(url).includes('/functions/v1/enqueue-course-media') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, mediaJobId: 'm-123' }),
          text: async () => JSON.stringify({ ok: true, mediaJobId: 'm-123' }),
        } as any;
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: 'not found' }),
        text: async () => 'not found',
      } as any;
    }) as any;
  });
  afterEach(() => {
    (global as any).fetch = originalFetch;
  });

  it('renders a Generate image button and invokes handler on click', async () => {
    const onStarted = jest.fn();
    const onDone = jest.fn();

    render(
      <ImageGenerateButton
        courseId="course-1"
        itemId="1"
        defaultPrompt="Detailed diagram of the heart on white background"
        onStarted={onStarted}
        onDone={onDone}
      />
    );

    const btn = screen.getByRole('button', { name: /generate image/i });
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);
    expect(onStarted).toHaveBeenCalled();

    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ ok: true, jobId: 'm-123', status: 'pending' })));
  });
});


