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
 * Auth: Required (editor or org_admin)
 * 
 * Body:
 *   {
 *     "courseId": "string",
 *     "changelog": "string (optional)"
 *   }
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { withCors } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL is required');
}
if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

const handler = async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'Missing authorization header' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    global: {
      headers: { Authorization: authHeader }
    }
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Parse request body
  const body = await req.json();
  const { courseId, changelog } = body;

  if (!courseId) {
    return new Response(
      JSON.stringify({ error: 'Missing courseId' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Fetch course metadata
  const { data: metadata, error: metadataError } = await supabase
    .from('course_metadata')
    .select('*')
    .eq('id', courseId)
    .single();

  if (metadataError || !metadata) {
    return new Response(
      JSON.stringify({ error: 'Course not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check user has editor or org_admin role
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', metadata.organization_id)
    .in('role', ['org_admin', 'editor'])
    .single();

  if (!userRole) {
    return new Response(
      JSON.stringify({ error: 'Not authorized to publish this course' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Load course JSON from storage
  const { data: courseFile, error: storageError } = await supabase
    .storage
    .from('courses')
    .download(`${courseId}/course.json`);

  if (storageError) {
    console.error('Error loading course from storage:', storageError);
    return new Response(
      JSON.stringify({ error: 'Failed to load course from storage' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const courseText = await courseFile.text();
  const courseJSON = JSON.parse(courseText);

  // Validate all tag_ids exist in tags table
  if (metadata.tag_ids && metadata.tag_ids.length > 0) {
    const { data: existingTags, error: tagsError } = await supabase
      .from('tags')
      .select('id')
      .in('id', metadata.tag_ids);

    if (tagsError) {
      console.error('Error validating tags:', tagsError);
      return new Response(
        JSON.stringify({ error: 'Failed to validate tags' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const existingTagIds = (existingTags || []).map(t => t.id);
    const invalidTags = metadata.tag_ids.filter((id: string) => !existingTagIds.includes(id));

    if (invalidTags.length > 0) {
      return new Response(
        JSON.stringify({
          error: 'Invalid tag IDs. Please approve all tags before publishing.',
          invalidTags
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // Bump content_version and etag
  const newContentVersion = (metadata.content_version || 0) + 1;
  const newEtag = (metadata.etag || 0) + 1;

  const { error: updateError } = await supabase
    .from('course_metadata')
    .update({
      content_version: newContentVersion,
      etag: newEtag,
      updated_at: new Date().toISOString()
    })
    .eq('id', courseId);

  if (updateError) {
    console.error('Error updating course_metadata:', updateError);
    return new Response(
      JSON.stringify({ error: 'Failed to update course metadata' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create course_versions snapshot
  const { data: versionData, error: versionError } = await supabase
    .from('course_versions')
    .insert({
      course_id: courseId,
      snapshot: courseJSON,
      published_by: user.id,
      changelog: changelog || `Published version ${newContentVersion}`,
      etag: newEtag
    })
    .select('id, version')
    .single();

  if (versionError) {
    console.error('Error creating course version:', versionError);
    return new Response(
      JSON.stringify({ error: 'Failed to create version snapshot' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Emit realtime event for clients to refresh course content/caches
  try {
    await supabase.from('catalog_updates').insert({
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


