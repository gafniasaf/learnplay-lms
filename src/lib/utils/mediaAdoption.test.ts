import { adoptMedia, MediaAdoptionRequest } from './mediaAdoption';

// Mock the edge function call
jest.mock('@/lib/api/common', () => ({
  callEdgeFunction: jest.fn(),
}));

import { callEdgeFunction } from '@/lib/api/common';

describe('mediaAdoption', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('moves asset from temp to canonical path via edge function', async () => {
    (callEdgeFunction as jest.Mock).mockResolvedValue({
      success: true,
      canonicalUrl: 'https://example.com/media.png',
    });

    const request: MediaAdoptionRequest = {
      assetId: 'asset-123',
      tempPath: 'temp/user123/image.png',
      canonicalPath: 'courses/time-grade-1/item-5/stimulus.png',
      bucket: 'media',
    };

    const result = await adoptMedia(request);

    expect(result.success).toBe(true);
    expect(result.canonicalUrl).toBe('https://example.com/media.png');
    expect(callEdgeFunction).toHaveBeenCalledWith('adopt-media', request);
  });

  it('returns error when edge function fails', async () => {
    (callEdgeFunction as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Move failed',
    });

    const request: MediaAdoptionRequest = {
      assetId: 'asset-123',
      tempPath: 'temp/user123/image.png',
      canonicalPath: 'courses/time-grade-1/item-5/stimulus.png',
      bucket: 'media',
    };

    const result = await adoptMedia(request);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Move failed');
  });

  it('handles network errors gracefully', async () => {
    (callEdgeFunction as jest.Mock).mockRejectedValue(new Error('Network error'));

    const request: MediaAdoptionRequest = {
      assetId: 'asset-123',
      tempPath: 'temp/user123/image.png',
      canonicalPath: 'courses/time-grade-1/item-5/stimulus.png',
      bucket: 'media',
    };

    const result = await adoptMedia(request);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });
});
