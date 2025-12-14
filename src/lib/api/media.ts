/**
 * Media API - IgniteZero compliant
 * Uses edge functions for storage operations
 */

import { callEdgeFunctionGet, callEdgeFunction, getSupabaseUrl, getSupabaseAnonKey } from "./common";

export interface MediaFile {
  name: string;
  path: string;
  size?: number;
  type?: string;
  created_at?: string;
  public_url?: string;
}

// List folders in bucket root
export async function listMediaFolders(bucket = "courses"): Promise<{ ok: boolean; folders: string[] }> {
  return callEdgeFunctionGet<{ ok: boolean; folders: string[] }>(
    "manage-media",
    { action: "list-folders", bucket }
  );
}

// List files in a path
export async function listMediaFiles(
  path: string,
  bucket = "courses"
): Promise<{ ok: boolean; files: MediaFile[] }> {
  return callEdgeFunctionGet<{ ok: boolean; files: MediaFile[] }>(
    "manage-media",
    { action: "list", path, bucket }
  );
}

// Get public URL for a file
export async function getMediaUrl(
  filePath: string,
  bucket = "courses"
): Promise<{ ok: boolean; url: string }> {
  return callEdgeFunctionGet<{ ok: boolean; url: string }>(
    "manage-media",
    { action: "get-url", file: filePath, bucket }
  );
}

// Delete a file
export async function deleteMediaFile(
  path: string,
  bucket = "courses"
): Promise<{ ok: boolean; message: string }> {
  return callEdgeFunction<{ path: string }, { ok: boolean; message: string }>(
    `manage-media?action=delete&bucket=${bucket}`,
    { path }
  );
}

// Get signed upload URL
export async function getMediaUploadUrl(
  path: string,
  contentType: string,
  bucket = "courses"
): Promise<{ ok: boolean; signedUrl: string; path: string }> {
  return callEdgeFunction<{ path: string; contentType: string }, { ok: boolean; signedUrl: string; path: string }>(
    `manage-media?action=get-upload-url&bucket=${bucket}`,
    { path, contentType }
  );
}

// Upload file directly (for small files, uploads via signed URL)
export async function uploadMediaFile(
  path: string,
  file: File,
  bucket = "courses"
): Promise<{ ok: boolean; url: string }> {
  // Get signed upload URL
  const { ok, signedUrl, path: uploadPath } = await getMediaUploadUrl(path, file.type, bucket);
  
  if (!ok || !signedUrl) {
    throw new Error("Failed to get upload URL");
  }

  // Upload directly to storage
  const response = await fetch(signedUrl, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": file.type,
    },
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  // Get the public URL
  const supabaseUrl = getSupabaseUrl();
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;

  return { ok: true, url: publicUrl };
}


