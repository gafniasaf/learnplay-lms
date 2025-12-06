/**
 * Media Adoption Utility
 * Moves temporary media assets to canonical paths in Supabase storage
 */

import { supabase } from '@/integrations/supabase/client';

export interface MediaAdoptionRequest {
  assetId: string;
  tempPath: string;
  canonicalPath: string;
  bucket: string;
}

export interface MediaAdoptionResult {
  success: boolean;
  canonicalUrl?: string;
  error?: string;
}

/**
 * Adopt a temporary media asset by moving it to canonical storage path
 */
export async function adoptMedia(
  request: MediaAdoptionRequest
): Promise<MediaAdoptionResult> {
  const { assetId, tempPath, canonicalPath, bucket } = request;

  try {
    // Move file in storage from temp → canonical
    const { error: moveError } = await supabase.storage
      .from(bucket)
      .move(tempPath, canonicalPath);

    if (moveError) {
      return {
        success: false,
        error: `Failed to move media: ${moveError.message}`,
      };
    }

    // Update media_assets table with new path
    const { error: updateError } = await supabase
      .from('media_assets')
      .update({ storage_path: canonicalPath })
      .eq('id', assetId);

    if (updateError) {
      console.warn('[mediaAdoption] Failed to update media_assets table:', updateError);
      // Non-fatal - file is moved, just metadata update failed
    }

    // Get public URL for the canonical path
    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(canonicalPath);

    return {
      success: true,
      canonicalUrl: publicUrlData.publicUrl,
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Batch adopt multiple media assets
 */
export async function adoptMediaBatch(
  requests: MediaAdoptionRequest[]
): Promise<MediaAdoptionResult[]> {
  return Promise.all(requests.map(req => adoptMedia(req)));
}

