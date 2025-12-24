/**
 * POST /publish-course
 * 
 * Publishes a course by:
 * 1. Validating user has editor/org_admin role for course's org
 * 2. Loading current course JSON from storage
 * 3. Validating all tags exist in tags table
 * 4. Bumping content_version and etag in course_metadata
 * 5. Creating course_versions snapshot
 * 6. Triggering async job to regenerate embeddings
 * 7. Invalidating CDN cache (future)
 * 
 * Auth: Required (editor or org_admin) OR valid Agent Token (dev/automation)
 * 
 * Body:
 *   {
 *     "courseId": "string",
 *     "changelog": "string (optional)"
 *   }
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { withCors } from '../_shared/cors.ts';
import { Errors } from '../_shared/error.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const expectedAgentToken = Deno.env.get('AGENT_TOKEN');

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL is required');
}
if (!supabaseAnonKey) {
  throw new Error('SUPABASE_ANON_KEY is required');
}
if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

// Create client ONCE at module load (per EDGE_DEPLOYMENT_RUNBOOK)
const service = createClient(supabaseUrl, supabaseServiceKey);

function getHeader(req: Request, name: string): string | null {
  return req.headers.get(name) ?? req.headers.get(name.toLowerCase()) ?? req.headers.get(name.toUpperCase());
}

function isValidAgentAuth(req: Request): boolean {
  const agentToken = getHeader(req, 'x-agent-token') ?? getHeader(req, 'X-Agent-Token');
  return Boolean(expectedAgentToken && agentToken && agentToken === expectedAgentToken);
}

function getAgentOrgId(req: Request): string | null {
  return (
    getHeader(req, 'x-organization-id') ??
    getHeader(req, 'X-Organization-Id') ??
    new URL(req.url).searchParams.get('iz_dev_org_id') ??
    new URL(req.url).searchParams.get('devOrgId') ??
    new URL(req.url).searchParams.get('orgId')
  );
}

const handler = async (req: Request) => {
  const requestId = crypto.randomUUID();
  if (req.method !== 'POST') {
    return Errors.methodNotAllowed(req.method, requestId, req);
  }

  const agentAuth = isValidAgentAuth(req);
  const agentOrgId = agentAuth ? getAgentOrgId(req) : null;

  // User-session auth path (for real logged-in admins)
  let user: { id: string } | null = null;
  if (!agentAuth) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return Errors.noAuth(requestId, req);
    }

    // IMPORTANT: Use a service client for DB/storage ops, but validate user session using the provided bearer token.
    // We pass the Authorization header only for auth.getUser(), not for DB writes.
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user: sessionUser }, error: userError } = await authClient.auth.getUser();
    if (userError || !sessionUser) {
      return Errors.invalidAuth(requestId, req);
    }
    user = { id: sessionUser.id };
  } else {
    // Agent-token auth path (preview/dev/automation)
    if (!agentOrgId) {
      return Errors.invalidRequest("Missing x-organization-id", requestId, req);
    }
  }

  // Parse request body
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return Errors.invalidRequest("Invalid JSON body", requestId, req);
  }
  const { courseId, changelog } = body || {};

  if (!courseId) {
    return Errors.invalidRequest("Missing courseId", requestId, req);
  }

  // Fetch course metadata
  const { data: metadata, error: metadataError } = await service
    .from('course_metadata')
    .select('*')
    .eq('id', courseId)
    .single();

  if (metadataError || !metadata) {
    return Errors.notFound("Course", requestId, req);
  }

  // Authorization
  if (agentAuth) {
    // In agent mode, enforce org boundary explicitly (service role bypasses RLS).
    if (String(metadata.organization_id) !== String(agentOrgId)) {
      return Errors.forbidden("Not authorized to publish this course", requestId, req);
    }
  } else {
    // User-session mode: require editor/org_admin for this org, OR superadmin.
    // NOTE: Other admin actions (e.g. delete-course) already treat superadmin as privileged.
    const { data: superRole } = await service
      .from('user_roles')
      .select('role')
      .eq('user_id', user!.id)
      .eq('role', 'superadmin')
      .maybeSingle();

    if (!superRole) {
      const { data: userRole } = await service
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id)
        .eq('organization_id', metadata.organization_id)
        .in('role', ['org_admin', 'editor'])
        .single();

      if (!userRole) {
        return Errors.forbidden("Not authorized to publish this course", requestId, req);
      }
    }
  }

  // Load course JSON from storage
  const { data: courseFile, error: storageError } = await service
    .storage
    .from('courses')
    .download(`${courseId}/course.json`);

  if (storageError) {
    console.error('Error loading course from storage:', storageError);
    return Errors.internal('Failed to load course from storage', requestId, req);
  }

  const courseText = await courseFile.text();
  const courseJSON = JSON.parse(courseText);

  // Validate all tag_ids exist in tags table
  if (metadata.tag_ids && metadata.tag_ids.length > 0) {
    const { data: existingTags, error: tagsError } = await service
      .from('tags')
      .select('id')
      .in('id', metadata.tag_ids);

    if (tagsError) {
      console.error('Error validating tags:', tagsError);
      return Errors.internal('Failed to validate tags', requestId, req);
    }

    const existingTagIds = (existingTags || []).map(t => t.id);
    const invalidTags = metadata.tag_ids.filter((id: string) => !existingTagIds.includes(id));

    if (invalidTags.length > 0) {
      return Errors.invalidRequest(
        `Invalid tag IDs. Please approve all tags before publishing. invalidTags=${invalidTags.join(",")}`,
        requestId,
        req
      );
    }
  }

  // Bump content_version and etag
  const newContentVersion = (metadata.content_version || 0) + 1;
  const newEtag = (metadata.etag || 0) + 1;

  const { error: updateError } = await service
    .from('course_metadata')
    .update({
      content_version: newContentVersion,
      etag: newEtag,
      updated_at: new Date().toISOString()
    })
    .eq('id', courseId);

  if (updateError) {
    console.error('Error updating course_metadata:', updateError);
    return Errors.internal('Failed to update course metadata', requestId, req);
  }

  // Create course_versions snapshot (hybrid storage):
  // - course snapshot JSON stored in Storage
  // - relational row stores version + storage_path + metadata snapshot
  const versionPath = `${courseId}/versions/${newContentVersion}.json`;
  try {
    const { error: verUploadErr } = await service.storage
      .from('courses')
      .upload(
        versionPath,
        new Blob([JSON.stringify(courseJSON, null, 2)], { type: 'application/json' }),
        { contentType: 'application/json', upsert: false }
      );
    if (verUploadErr) {
      console.error('Error uploading course version snapshot:', verUploadErr);
      return Errors.internal(`Failed to upload version snapshot: ${verUploadErr.message}`, requestId, req);
    }
  } catch (e) {
    console.error('Error uploading course version snapshot:', e);
    return Errors.internal('Failed to upload version snapshot', requestId, req);
  }

  const { data: versionData, error: versionError } = await service
    .from('course_versions')
    .insert({
      course_id: courseId,
      version: newContentVersion,
      storage_path: versionPath,
      // In agent-token mode there may not be a real auth.users id available.
      // published_by is nullable in this repo's current schema; do NOT write placeholder user ids.
      published_by: agentAuth ? null : user!.id,
      change_summary: changelog || `Published version ${newContentVersion}`,
      metadata_snapshot: {
        course_id: courseId,
        organization_id: metadata.organization_id,
        visibility: metadata.visibility,
        tag_ids: metadata.tag_ids ?? [],
        tags: metadata.tags ?? {},
        content_version: newContentVersion,
        etag: newEtag,
      },
    })
    .select('id, version')
    .single();

  if (versionError) {
    console.error('Error creating course version:', versionError);
    return Errors.internal(`Failed to create version snapshot: ${versionError.message}`, requestId, req);
  }

  // Emit realtime event for clients to refresh course content/caches
  try {
    await service.from('catalog_updates').insert({
      course_id: courseId,
      action: 'updated',
      catalog_version: newEtag || newContentVersion || 1,
      course_title: metadata.title || courseId,
    });
  } catch (e) {
    console.warn('[publish-course] Failed to insert catalog_updates row:', e);
  }

  // Trigger async job to regenerate embeddings (best-effort, non-blocking semantics)
  // Uses the internal `regenerate-embeddings` Edge Function, which is responsible
  // for comparing snapshots and updating content_embeddings as it evolves.
  try {
    const internalClient = createClient(supabaseUrl, supabaseServiceKey);
    // For now we only pass the latest snapshot; the handler tolerates missing oldSnapshot
    const { data: regenData, error: regenError } = await (internalClient as any)
      .functions
      .invoke('regenerate-embeddings', {
        body: {
          courseId,
          newSnapshot: courseJSON,
        },
      });

    if (regenError) {
      console.warn('[publish-course] regenerate-embeddings failed:', regenError);
    } else {
      console.log('[publish-course] regenerate-embeddings triggered:', regenData);
    }
  } catch (e) {
    console.warn('[publish-course] Failed to trigger regenerate-embeddings:', e);
  }

  // CDN cache invalidation is handled by the frontend via invalidateCourseCache()
  // after a successful publish (see src/lib/utils/cacheInvalidation.ts and callers).
  // This keeps Cloudflare credentials in the client deployment pipeline only.

  return new Response(
    JSON.stringify({
      version: versionData.version,
      snapshotId: versionData.id,
      contentVersion: newContentVersion,
      etag: newEtag,
      publishedAt: new Date().toISOString()
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

Deno.serve(withCors(handler));


