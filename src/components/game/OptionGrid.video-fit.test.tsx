import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { OptionGrid } from './OptionGrid';

// Mock utilities for testing
const screen = {
  getByRole: (role: string) => document.querySelector(`[role="${role}"]`),
  getAllByRole: (role: string) => Array.from(document.querySelectorAll(`[role="${role}"]`)),
};

const waitFor = async (callback: () => void | Promise<void>, options = { timeout: 1000 }) => {
  const start = Date.now();
  while (Date.now() - start < options.timeout) {
    try {
      await callback();
      return;
    } catch (e) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  await callback();
};

function dispatchLoadedMetadata(el: HTMLVideoElement, width: number, height: number) {
  // Define instance properties for jsdom
  Object.defineProperty(el, 'videoWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'videoHeight', { value: height, configurable: true });
  const evt = new Event('loadedmetadata');
  el.dispatchEvent(evt);
}

describe('OptionGrid video smart-fit', () => {
  const onSelect = jest.fn();

  it('uses object-cover for ~16:9 videos', () => {
    const { container } = render(
      <OptionGrid
        options={[""]}
        onSelect={onSelect}
        optionMedia={[{ type: 'video', url: 'https://example.com/v.mp4' } as any]}
        itemId={10}
        clusterId="vid"
        variant="a"
      />
    );

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).toBeTruthy();

    act(() => {
      dispatchLoadedMetadata(video, 1600, 900);
    });

    return waitFor(() => expect(video).toHaveClass('object-cover'));
  });

  it('uses object-contain for non-16:9 videos (portrait)', () => {
    const { container } = render(
      <OptionGrid
        options={[""]}
        onSelect={onSelect}
        optionMedia={[{ type: 'video', url: 'https://example.com/v2.mp4' } as any]}
        itemId={11}
        clusterId="vid"
        variant="b"
      />
    );

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).toBeTruthy();

    act(() => {
      dispatchLoadedMetadata(video, 900, 1600);
    });

    return waitFor(() => expect(video).toHaveClass('object-contain'));
  });
});
