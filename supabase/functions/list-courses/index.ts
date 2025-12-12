import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors } from "../_shared/cors.ts";

interface CourseListParams {
  page: number;
  limit: number;
  tags: string[];
  sort: 'title_asc' | 'title_desc' | 'newest' | 'oldest';
  search: string | null;
}

serve(withCors(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    let userOrgId: string | null = null;

    // Try to authenticate user (optional for public courses)
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (!authError && user) {
        userId = user.id;
        
        // Get user's organization
        const { data: orgData } = await supabase
          .from('organization_users')
          .select('org_id')
          .eq('user_id', user.id)
          .single();
        
        if (orgData) {
          userOrgId = orgData.org_id;
        }
      }
    }

    // Parse query parameters
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
    const tagsParam = url.searchParams.get('tags');
    const tags = tagsParam ? tagsParam.split(',').filter(t => t.trim()) : [];
    const sort = (url.searchParams.get('sort') || 'newest') as CourseListParams['sort'];
    const search = url.searchParams.get('search') || null;

    console.log('[list-courses] Params:', { page, limit, tags, sort, search, userId, userOrgId });

    // Build query
    let query = supabase
      .from('course_metadata')
      .select('*', { count: 'exact' });

    // Apply visibility filter (global vs org)
    if (userOrgId) {
      // User can see their org's courses + global courses
      query = query.or(`organization_id.eq.${userOrgId},visibility.eq.global`);
    } else {
      // Unauthenticated users can see global only
      query = query.or('visibility.eq.global');
    }

    // Exclude deleted always; exclude archived unless includeArchived=1 and caller is superadmin
    const includeArchived = url.searchParams.get('includeArchived') === '1';
    let isSuperadmin = false;
    if (authHeader && includeArchived) {
      // best-effort role check
      const token = authHeader.replace('Bearer ', '');
      const { data: authData } = await supabase.auth.getUser(token);
      if (authData?.user?.id) {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role, organization_id')
          .eq('user_id', authData.user.id);
        isSuperadmin = Array.isArray(roles) && roles.some((r: any) => r.role === 'superadmin');
      }
    }
    query = query.is('deleted_at', null);
    if (!(includeArchived && isSuperadmin)) {
      query = query.is('archived_at', null);
    }

    // Apply tag filter
    if (tags.length > 0) {
      // Get tag IDs from tag slugs
      const { data: tagData } = await supabase
        .from('tags')
        .select('id')
        .in('slug', tags);
      
      if (tagData && tagData.length > 0) {
        const tagIds = tagData.map(t => t.id);
        // Filter courses that have any of these tags
        query = query.overlaps('tag_ids', tagIds);
      } else {
        // No matching tags found, return empty
        return new Response(
          JSON.stringify({
            items: [],
            total: 0,
            page,
            pageSize: limit,
            totalPages: 0
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Apply search filter - search across title, subject, and ID
    if (search) {
      query = query.or(`title.ilike.%${search}%,subject.ilike.%${search}%,id.ilike.%${search}%`);
    }

    // Apply sorting
    switch (sort) {
      case 'title_asc':
        query = query.order('id', { ascending: true });
        break;
      case 'title_desc':
        query = query.order('id', { ascending: false });
        break;
      case 'newest':
        query = query.order('created_at', { ascending: false });
        break;
      case 'oldest':
        query = query.order('created_at', { ascending: true });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }

    // Apply pagination
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data: metadata, error: metadataError, count } = await query;

    if (metadataError) {
      console.error('[list-courses] Metadata query error:', metadataError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch courses', details: String(metadataError?.message || metadataError) }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!metadata || metadata.length === 0) {
      return new Response(
        JSON.stringify({
          items: [],
          total: count || 0,
          page,
          pageSize: limit,
          totalPages: 0
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch actual course data from storage
    const courses = await Promise.all(
      metadata.map(async (meta: any) => {
        try {
          const path = `${meta.id}/course.json`;
          const { data: file, error: downloadErr } = await supabase.storage
            .from('courses')
            .download(path);

          if (downloadErr || !file) {
            console.warn(`[list-courses] Course ${meta.id} not found in storage`);
            return null;
          }

          const text = await file.text();
          if (!text || text.trim() === '') {
            console.warn(`[list-courses] Course ${meta.id} has empty course.json`);
            return null;
          }

          const courseData = JSON.parse(text);

          return {
            id: meta.id,
            title: meta.title || courseData.title || meta.id,
            description: courseData.description || '',
            grade: meta.grade_band || courseData.grade || null,
            subject: meta.subject || courseData.subject || null,
            itemCount: Array.isArray(courseData.items) ? courseData.items.length : 0,
            tags: meta.tags || {},
            tagIds: meta.tag_ids || [],
            visibility: meta.visibility,
            organizationId: meta.organization_id,
            contentVersion: meta.content_version,
            createdAt: meta.created_at,
            updatedAt: meta.updated_at,
            archivedAt: meta.archived_at || null
          };
        } catch (error) {
          console.error(`[list-courses] Error processing course ${meta.id}:`, error);
          return null;
        }
      })
    );

    // Filter out null entries (failed courses)
    const validCourses = courses.filter(c => c !== null);

    const totalPages = count ? Math.ceil(count / limit) : 0;

    console.log(`[list-courses] Returning ${validCourses.length} courses (page ${page}/${totalPages})`);

    return new Response(
      JSON.stringify({
        items: validCourses,
        total: count || 0,
        page,
        pageSize: limit,
        totalPages
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[list-courses] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}));

