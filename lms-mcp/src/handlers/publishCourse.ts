import { config } from "../config";
import { fetchJson } from "../http";
import { createClient } from "@supabase/supabase-js";

export interface PublishCourseInput {
  courseId: string;
  changelog?: string;
}

export async function publishCourse({ params }: { params: PublishCourseInput }) {
  const url = `${config.supabaseUrl}/functions/v1/publish-course`;
  const res = await fetchJson(url, {
    method: 'POST',
    headers: {
      'X-Agent-Token': config.agentToken,
      'Content-Type': 'application/json',
    },
    body: params,
    timeoutMs: 15000,
  });
  if (res.ok) {
    return res.json;
  }

  // Fallback: Local SR-backed publish for dev if Edge function is missing
  const couldBeMissing = res.status === 404 || String(res.text || '').toLowerCase().includes('not found');
  const allowLocalSr = config.allowServiceRole && !!config.serviceRoleKey;
  if (couldBeMissing && allowLocalSr) {
    const { courseId, changelog } = params;
    const supabase = createClient(config.supabaseUrl, config.serviceRoleKey);

    // Load metadata
    const { data: metadata, error: metadataError } = await supabase
      .from('course_metadata')
      .select('*')
      .eq('id', courseId)
      .single();
    if (metadataError || !metadata) {
      throw new Error(`course_not_found`);
    }

    // Load current course JSON from storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('courses')
      .download(`${courseId}/course.json`);
    if (downloadError || !fileData) {
      throw new Error(`course_storage_not_found`);
    }
    const courseJSON = JSON.parse(await fileData.text());

    // Bump content_version and etag
    const newContentVersion = (metadata.content_version || 0) + 1;
    const newEtag = (metadata.etag || 0) + 1;
    const { error: updateError } = await supabase
      .from('course_metadata')
      .update({
        content_version: newContentVersion,
        etag: newEtag,
        updated_at: new Date().toISOString(),
      })
      .eq('id', courseId);
    if (updateError) {
      throw new Error(`update_metadata_failed`);
    }

    // Insert course_versions snapshot
    const { data: versionRow, error: versionError } = await supabase
      .from('course_versions')
      .insert({
        course_id: courseId,
        snapshot: courseJSON,
        published_by: 'agent',
        changelog: changelog || `Published version ${newContentVersion}`,
        etag: newEtag,
      })
      .select('id, version')
      .single();
    if (versionError) {
      throw new Error(`create_version_failed`);
    }

    // Best-effort catalog update
    try {
      await supabase.from('catalog_updates').insert({
        course_id: courseId,
        action: 'updated',
        catalog_version: newEtag || newContentVersion || 1,
        course_title: metadata.title || courseId,
        request_id: `mcp-${Date.now()}`,
      });
    } catch {}

    return {
      ok: true,
      version: versionRow?.version,
      snapshotId: versionRow?.id,
      contentVersion: newContentVersion,
      etag: newEtag,
      publishedAt: new Date().toISOString(),
      path: 'mcp-fallback',
    };
  }

  const errMsg = (res as any)?.json?.error || res.text;
  const errDetails = (res as any)?.json?.details;
  throw new Error(`publish-course failed (${res.status}): ${errMsg}${errDetails ? ` - ${errDetails}` : ''}`);
}


