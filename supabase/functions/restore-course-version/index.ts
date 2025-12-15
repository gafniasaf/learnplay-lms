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

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL is required');
}
if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

const handler = async (req: Request) => {
  const requestId = crypto.randomUUID();
  if (req.method !== 'POST') {
    return Errors.methodNotAllowed(req.method, requestId, req);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return Errors.noAuth(requestId, req);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    global: {
      headers: { Authorization: authHeader }
    }
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return Errors.invalidAuth(requestId, req);
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
  const { data: metadata, error: metadataError } = await supabase
    .from('course_metadata')
    .select('*')
    .eq('id', courseId)
    .single();

  if (metadataError || !metadata) {
    return Errors.notFound("Course", requestId, req);
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
    return Errors.forbidden("Not authorized to restore this course", requestId, req);
  }

  // Call restore_course_version function
  const { data: restoreResult, error: restoreError } = await supabase
    .rpc('restore_course_version', {
      p_course_id: courseId,
      p_restore_from_version: version,
      p_changelog: changelog || `Restored from version ${version}`
    });

  if (restoreError) {
    console.error('Error restoring course version:', restoreError);
    return new Response(
      JSON.stringify({ error: restoreError.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Fetch the newly created version details
  const { data: newVersion, error: versionError } = await supabase
    .from('course_versions')
    .select('id, version, etag, published_at')
    .eq('id', restoreResult)
    .single();

  if (versionError) {
    console.error('Error fetching new version:', versionError);
    return new Response(
      JSON.stringify({ error: 'Version restored but failed to fetch details' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Write restored snapshot back to storage
  const { data: restoredSnapshot } = await supabase
    .from('course_versions')
    .select('snapshot')
    .eq('course_id', courseId)
    .eq('version', newVersion.version)
    .single();

  if (restoredSnapshot?.snapshot) {
    const { error: uploadError } = await supabase
      .storage
      .from('courses')
      .upload(
        `${courseId}/course.json`,
        new Blob([JSON.stringify(restoredSnapshot.snapshot, null, 2)], { type: 'application/json' }),
        {
          contentType: 'application/json',
          upsert: true
        }
      );

    if (uploadError) {
      console.error('Error uploading restored course to storage:', uploadError);
      // Don't fail the request; version is still created in DB
    }
  }

  // TODO: Invalidate CDN cache
  console.log(`[restore-course-version] Should invalidate CDN cache for course ${courseId}`);

  return new Response(
    JSON.stringify({
      newVersion: newVersion.version,
      restoredFromVersion: version,
      snapshotId: newVersion.id,
      etag: newVersion.etag,
      publishedAt: newVersion.published_at
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

Deno.serve(withCors(handler));


