/**
 * Media Adoption Utility - IgniteZero compliant
 * Moves temporary media assets to canonical paths via edge function
 */

import { callEdgeFunction } from '@/lib/api/common';

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
  try {
    const result = await callEdgeFunction<MediaAdoptionRequest, MediaAdoptionResult>(
      'adopt-media',
      request
    );
    return result;
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
