/**
 * POST /restore-course-version
 * 
 * Restores a course to a specific version by creating a new version (non-destructive)
 * 
 * Auth: Required (editor or org_admin)
 * 
 * Body:
 *   {
 *     "courseId": "string",
 *     "version": number,
 *     "changelog": "string (optional)"
 *   }
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { withCors } from '../_shared/cors.ts';
import { Errors } from '../_shared/error.ts';
import { authenticateRequest } from '../_shared/auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL is required');
}
if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

const admin = createClient(supabaseUrl, supabaseServiceKey);

const handler = async (req: Request) => {
  const requestId = crypto.randomUUID();
  if (req.method !== 'POST') {
    return Errors.methodNotAllowed(req.method, requestId, req);
  }

  let auth;
  try {
    auth = await authenticateRequest(req);
  } catch {
    return Errors.invalidAuth(requestId, req);
  }

  const isAgent = auth.type === 'agent';
  const organizationId = auth.organizationId;
  if (isAgent && !organizationId) {
    return Errors.invalidRequest('Missing x-organization-id for agent auth', requestId, req);
  }

  // Parse request body
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return Errors.invalidRequest("Invalid JSON body", requestId, req);
  }
  const { courseId, version, changelog } = body;

  if (!courseId || version === undefined) {
    return Errors.invalidRequest("Missing courseId or version", requestId, req);
  }

  // Fetch course metadata
  const { data: metadata, error: metadataError } = await admin
    .from('course_metadata')
    .select('*')
    .eq('id', courseId)
    .single();

  if (metadataError || !metadata) {
    return Errors.notFound("Course", requestId, req);
  }

  // Authorization:
  // - preview/dev-agent: agent token is treated as org-admin for provided org (must match course org)
  // - user-session: require editor/org_admin role for org (or superadmin)
  if (isAgent) {
    if (String(metadata.organization_id) !== String(organizationId)) {
      return Errors.forbidden('Not authorized to restore this course', requestId, req);
    }
  } else {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return Errors.invalidAuth(requestId, req);
    }
    const userId = userData.user.id;

    const { data: superRole } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'superadmin')
      .maybeSingle();

    if (!superRole) {
      const { data: userRole } = await admin
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('organization_id', metadata.organization_id)
        .in('role', ['org_admin', 'editor'])
        .single();

      if (!userRole) {
        return Errors.forbidden('Not authorized to restore this course', requestId, req);
      }
    }
  }

  // Implementation note:
  // The SQL RPC restore_course_version() uses auth.uid() and therefore cannot run under agent-token auth.
  // We implement restore here directly (hybrid storage): create a new version row + write snapshot to storage.

  // Load requested version row
  const { data: v, error: vErr } = await admin
    .from('course_versions')
    .select('*')
    .eq('course_id', courseId)
    .eq('version', version)
    .maybeSingle();
  if (vErr) return Errors.internal(vErr.message, requestId, req);
  if (!v) return Errors.notFound('Course version', requestId, req);

  const snapshot = (v as any).snapshot ?? (v as any).metadata_snapshot ?? null;
  let restoredJson: any = snapshot;
  if (!restoredJson) {
    const storagePath = (v as any).storage_path as string | undefined;
    if (!storagePath) return Errors.internal('Course version exists but no snapshot/storage_path available', requestId, req);
    const { data: file, error: dlErr } = await admin.storage.from('courses').download(storagePath);
    if (dlErr || !file) return Errors.internal(dlErr?.message || 'Failed to download snapshot', requestId, req);
    const text = await file.text();
    restoredJson = text ? JSON.parse(text) : null;
    if (!restoredJson) return Errors.internal('Snapshot file is empty', requestId, req);
  }

  // Bump content_version + etag on course_metadata
  const newContentVersion = Number((metadata as any).content_version || 0) + 1;
  const newEtag = Number((metadata as any).etag || 0) + 1;

  const { error: metaUpErr } = await admin
    .from('course_metadata')
    .update({ content_version: newContentVersion, etag: newEtag, updated_at: new Date().toISOString() })
    .eq('id', courseId);
  if (metaUpErr) return Errors.internal(metaUpErr.message, requestId, req);

  // Write restored snapshot back to storage (course.json)
  const { error: uploadErr } = await admin.storage
    .from('courses')
    .upload(
      `${courseId}/course.json`,
      new Blob([JSON.stringify(restoredJson, null, 2)], { type: 'application/json' }),
      { contentType: 'application/json', upsert: true },
    );
  if (uploadErr) return Errors.internal(uploadErr.message, requestId, req);

  // Create new version snapshot in storage + DB (mirrors publish-course strategy)
  const versionPath = `${courseId}/versions/${newContentVersion}.json`;
  const { error: verUploadErr } = await admin.storage
    .from('courses')
    .upload(
      versionPath,
      new Blob([JSON.stringify(restoredJson, null, 2)], { type: 'application/json' }),
      { contentType: 'application/json', upsert: false },
    );
  if (verUploadErr) return Errors.internal(`Failed to upload version snapshot: ${verUploadErr.message}`, requestId, req);

  // Actor: only store published_by when we have a real auth.users id
  let publishedBy: string | null = null;
  if (!isAgent) {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData } = await admin.auth.getUser(token);
    publishedBy = userData?.user?.id ?? null;
  }

  const { data: newVersionRow, error: insErr } = await admin
    .from('course_versions')
    .insert({
      course_id: courseId,
      version: newContentVersion,
      storage_path: versionPath,
      published_by: publishedBy,
      change_summary: changelog || `Restored from version ${version}`,
      metadata_snapshot: {
        course_id: courseId,
        organization_id: metadata.organization_id,
        visibility: (metadata as any).visibility,
        tag_ids: (metadata as any).tag_ids ?? [],
        tags: (metadata as any).tags ?? {},
        content_version: newContentVersion,
        etag: newEtag,
      },
    })
    .select('id, version, published_at')
    .single();
  if (insErr) return Errors.internal(insErr.message, requestId, req);

  // TODO: Invalidate CDN cache
  console.log(`[restore-course-version] Should invalidate CDN cache for course ${courseId}`);

  return {
    ok: true,
    newVersion: newVersionRow.version,
    restoredFromVersion: version,
    snapshotId: newVersionRow.id,
    etag: newEtag,
    publishedAt: (newVersionRow as any).published_at,
  };
};

Deno.serve(withCors(handler));


