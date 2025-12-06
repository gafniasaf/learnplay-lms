import { adoptMedia, MediaAdoptionRequest } from './mediaAdoption';
import { supabase } from '@/integrations/supabase/client';

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: jest.fn(),
    },
    from: jest.fn(),
  },
}));

describe('mediaAdoption', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('moves asset from temp to canonical path', async () => {
    const mockMove = jest.fn().mockResolvedValue({ data: {}, error: null });
    const mockGetPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/media.png' } });
    const mockUpdate = jest.fn().mockReturnThis();
    const mockEq = jest.fn().mockResolvedValue({ data: {}, error: null });

    (supabase.storage.from as jest.Mock).mockReturnValue({
      move: mockMove,
      getPublicUrl: mockGetPublicUrl,
    });

    (supabase.from as jest.Mock).mockReturnValue({
      update: mockUpdate,
      eq: mockEq,
    });

    const request: MediaAdoptionRequest = {
      assetId: 'asset-123',
      tempPath: 'temp/user123/image.png',
      canonicalPath: 'courses/time-grade-1/item-5/stimulus.png',
      bucket: 'media',
    };

    const result = await adoptMedia(request);

    expect(result.success).toBe(true);
    expect(mockMove).toHaveBeenCalledWith('temp/user123/image.png', 'courses/time-grade-1/item-5/stimulus.png');
  });

  it('updates media_assets table with new path', async () => {
    const mockMove = jest.fn().mockResolvedValue({ data: {}, error: null });
    const mockUpdate = jest.fn().mockReturnThis();
    const mockEq = jest.fn().mockResolvedValue({ data: {}, error: null });

    (supabase.storage.from as jest.Mock).mockReturnValue({
      move: mockMove,
    });

    (supabase.from as jest.Mock).mockReturnValue({
      update: mockUpdate,
      eq: mockEq,
    });

    const request: MediaAdoptionRequest = {
      assetId: 'asset-123',
      tempPath: 'temp/user123/image.png',
      canonicalPath: 'courses/time-grade-1/item-5/stimulus.png',
      bucket: 'media',
    };

    await adoptMedia(request);

    expect(supabase.from).toHaveBeenCalledWith('media_assets');
    expect(mockUpdate).toHaveBeenCalledWith({ storage_path: 'courses/time-grade-1/item-5/stimulus.png' });
  });

  it('returns error when storage move fails', async () => {
    const mockMove = jest.fn().mockResolvedValue({ data: null, error: { message: 'Move failed' } });

    (supabase.storage.from as jest.Mock).mockReturnValue({
      move: mockMove,
    });

    const request: MediaAdoptionRequest = {
      assetId: 'asset-123',
      tempPath: 'temp/user123/image.png',
      canonicalPath: 'courses/time-grade-1/item-5/stimulus.png',
      bucket: 'media',
    };

    const result = await adoptMedia(request);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Move failed');
  });
});

