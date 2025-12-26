/**
 * Image Migration from Legacy Blob Storage to Supabase Storage
 * 
 * Downloads images from Azure Blob Storage and uploads to Supabase.
 */

import type { ImageMigrationResult } from './types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const LEGACY_BLOB_BASE = 'https://expertcollegeresources.blob.core.windows.net/assets-cnt';
const SUPABASE_STORAGE_BUCKET = 'media-library';

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE MIGRATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class ImageMigrator {
  private supabaseUrl: string;
  private supabaseServiceKey: string;
  private migratedCache: Map<string, string> = new Map();
  private failedUrls: Set<string> = new Set();

  constructor(supabaseUrl: string, supabaseServiceKey: string) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseServiceKey = supabaseServiceKey;
  }

  /**
   * Migrate a single image
   */
  async migrateImage(originalUrl: string, targetPath: string): Promise<ImageMigrationResult> {
    // Check cache
    if (this.migratedCache.has(originalUrl)) {
      return {
        originalUrl,
        newUrl: this.migratedCache.get(originalUrl)!,
        success: true,
      };
    }

    // Skip if previously failed
    if (this.failedUrls.has(originalUrl)) {
      return {
        originalUrl,
        newUrl: originalUrl,
        success: false,
        error: 'Previously failed - skipping',
      };
    }

    try {
      // Download image
      console.log(`  📥 Downloading: ${originalUrl.substring(0, 80)}...`);
      const response = await fetch(originalUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      // Upload to Supabase Storage
      console.log(`  📤 Uploading to: ${targetPath}`);
      const uploadResponse = await fetch(
        `${this.supabaseUrl}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}/${targetPath}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.supabaseServiceKey}`,
            'Content-Type': contentType,
            'x-upsert': 'true',
          },
          body: arrayBuffer,
        }
      );

      if (!uploadResponse.ok) {
        const err = await uploadResponse.text();
        throw new Error(`Upload failed: ${err}`);
      }

      // Construct public URL
      const newUrl = `${this.supabaseUrl}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${targetPath}`;
      
      // Cache result
      this.migratedCache.set(originalUrl, newUrl);

      console.log(`  ✅ Migrated successfully`);
      return {
        originalUrl,
        newUrl,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Failed: ${errorMessage}`);
      this.failedUrls.add(originalUrl);
      
      return {
        originalUrl,
        newUrl: originalUrl, // Keep original as fallback
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Migrate batch of images with progress
   */
  async migrateBatch(
    urls: string[],
    courseId: string,
    onProgress?: (completed: number, total: number) => void
  ): Promise<Map<string, string>> {
    const urlMapping = new Map<string, string>();
    let completed = 0;

    console.log(`\n🖼️  Migrating ${urls.length} images for course ${courseId}...`);

    for (const originalUrl of urls) {
      // Generate target path
      const targetPath = this.generateTargetPath(originalUrl, courseId);
      
      const result = await this.migrateImage(originalUrl, targetPath);
      urlMapping.set(originalUrl, result.newUrl);
      
      completed++;
      onProgress?.(completed, urls.length);
    }

    console.log(`✅ Image migration complete: ${this.migratedCache.size} succeeded, ${this.failedUrls.size} failed\n`);
    
    return urlMapping;
  }

  /**
   * Generate storage path for image
   */
  private generateTargetPath(originalUrl: string, courseId: string): string {
    // Extract filename from URL
    const urlPath = new URL(originalUrl).pathname;
    const filename = urlPath.split('/').pop() || 'image.jpg';
    
    // Clean filename
    const cleanFilename = filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .toLowerCase();
    
    // Generate unique path
    const timestamp = Date.now();
    return `courses/${courseId}/legacy-import/${timestamp}-${cleanFilename}`;
  }

  /**
   * Create URL mapper function for content transformation
   */
  createUrlMapper(urlMapping: Map<string, string>): (originalUrl: string) => string {
    return (originalUrl: string) => {
      return urlMapping.get(originalUrl) || originalUrl;
    };
  }

  /**
   * Get migration stats
   */
  getStats(): { migrated: number; failed: number } {
    return {
      migrated: this.migratedCache.size,
      failed: this.failedUrls.size,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize legacy image URL to full URL
 */
export function normalizeLegacyImageUrl(url: string): string {
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) {
    return `${LEGACY_BLOB_BASE}${url}`;
  }
  return `${LEGACY_BLOB_BASE}/${url}`;
}

/**
 * Validate image URL is accessible
 */
export async function validateImageUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

