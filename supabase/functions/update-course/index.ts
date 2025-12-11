// Edge Function: update-course
// Accepts JSON Patch operations, validates, applies to course, and saves to storage

import { createClient } from 'npm:@supabase/supabase-js@2';
import { withCors } from '../_shared/cors.ts';
import { jsonOk, jsonError } from '../_shared/error.ts';
import { getRequestId } from '../_shared/log.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL is required');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

interface PatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: any;
  from?: string;
}

interface UpdateCourseRequest {
  courseId: string;
  ops: PatchOperation[];
  expectedEtag?: string;
}

Deno.serve(withCors(async (req) => {
  const reqId = getRequestId(req);

  try {
    // Parse and validate request
    const body: UpdateCourseRequest = await req.json();
    
    if (!body.courseId || !body.ops) {
      return jsonError('invalid_request', 'courseId and ops are required', 400, reqId, req);
    }

    const { courseId, ops, expectedEtag } = body;

    // Validate ops array
    if (!Array.isArray(ops) || ops.length === 0) {
      return jsonError('validation_error', 'ops must be a non-empty array', 400, reqId, req);
    }

    // Validate each operation
    for (const op of ops) {
      if (!['add', 'remove', 'replace', 'move', 'copy', 'test'].includes(op.op)) {
        return jsonError('validation_error', `Invalid operation: ${op.op}`, 400, reqId, req);
      }
      if (!op.path || typeof op.path !== 'string') {
        return jsonError('validation_error', 'Each operation must have a valid path', 400, reqId, req);
      }
      if (['add', 'replace', 'test'].includes(op.op) && op.value === undefined) {
        return jsonError('validation_error', `Operation ${op.op} requires a value`, 400, reqId, req);
      }
      if (['move', 'copy'].includes(op.op) && !op.from) {
        return jsonError('validation_error', `Operation ${op.op} requires a from path`, 400, reqId, req);
      }
    }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch current course from storage (path: <courseId>/course.json)
    const coursePath = `${courseId}/course.json`;
    const { data: fileData, error: fetchError } = await supabase.storage
      .from('courses')
      .download(coursePath);

    if (fetchError) {
      return jsonError('not_found', `Failed to fetch course: ${fetchError.message}`, 404, reqId, req);
    }

    const courseText = await fileData.text();
    const course = JSON.parse(courseText);

    // Check etag if provided (optimistic concurrency control)
    if (expectedEtag) {
      const { data: metadata } = await supabase.storage
        .from('courses')
        .list(`${courseId}`, { search: `course.json` });
      
      const currentFile = metadata?.find(f => f.name === `course.json`);
      if (currentFile?.metadata?.etag && currentFile.metadata.etag !== expectedEtag) {
        return jsonError(
          'conflict',
          'Course has been modified by another user. Please reload and try again.',
          409,
          reqId,
          req
        );
      }
    }

    // Apply patches to course
    const updatedCourse = applyPatches(course, ops);

    // Bump contentVersion
    updatedCourse.contentVersion = (updatedCourse.contentVersion || 0) + 1;
    updatedCourse.updatedAt = new Date().toISOString();

    // Write updated course to storage
    const updatedContent = JSON.stringify(updatedCourse, null, 2);
    const { error: uploadError } = await supabase.storage
      .from('courses')
      .upload(coursePath, new Blob([updatedContent], { type: 'application/json' }), {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      return jsonError('storage_error', `Failed to save course: ${uploadError.message}`, 500, reqId, req);
    }

    // Get new etag
    const { data: newMetadata } = await supabase.storage
      .from('courses')
      .list(`${courseId}`, { search: `course.json` });
    
    const updatedFile = newMetadata?.find(f => f.name === `course.json`);
    const newEtag = updatedFile?.metadata?.etag || '';

    console.log(`[update-course] Course ${courseId} updated to version ${updatedCourse.contentVersion}`);

    return jsonOk({
      course: updatedCourse,
      contentVersion: updatedCourse.contentVersion,
      etag: newEtag,
      opsApplied: ops.length,
    }, reqId, req);

  } catch (error) {
    console.error('[update-course] Error:', error);
    return jsonError(
      'internal_error',
      error instanceof Error ? error.message : 'Unknown error',
      500,
      reqId,
      req
    );
  }
}));

/**
 * Apply JSON Patch operations to an object
 * Simplified implementation supporting common ops
 */
function applyPatches(obj: any, ops: PatchOperation[]): any {
  const result = JSON.parse(JSON.stringify(obj)); // Deep clone

  for (const op of ops) {
    const pathParts = op.path.split('/').filter(p => p !== '');

    if (op.op === 'replace') {
      setValueAtPath(result, pathParts, op.value);
    } else if (op.op === 'add') {
      // Handle array append (-) or object/array insert
      if (pathParts[pathParts.length - 1] === '-') {
        // Array append
        const arrayPath = pathParts.slice(0, -1);
        const array = getValueAtPath(result, arrayPath);
        if (Array.isArray(array)) {
          array.push(op.value);
        } else {
          throw new Error(`Cannot append to non-array at path: ${op.path}`);
        }
      } else {
        setValueAtPath(result, pathParts, op.value);
      }
    } else if (op.op === 'remove') {
      removeValueAtPath(result, pathParts);
    } else if (op.op === 'test') {
      const currentValue = getValueAtPath(result, pathParts);
      if (JSON.stringify(currentValue) !== JSON.stringify(op.value)) {
        throw new Error(`Test operation failed at path: ${op.path}`);
      }
    }
    // move and copy ops not implemented in MVP
  }

  return result;
}

function getValueAtPath(obj: any, pathParts: string[]): any {
  let current = obj;
  for (const part of pathParts) {
    if (current === undefined || current === null) {
      throw new Error(`Invalid path: cannot traverse ${part}`);
    }
    current = current[part];
  }
  return current;
}

function setValueAtPath(obj: any, pathParts: string[], value: any): void {
  if (pathParts.length === 0) {
    throw new Error('Cannot set value at root path');
  }

  let current = obj;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (current[part] === undefined) {
      // Create intermediate objects/arrays as needed
      const nextPart = pathParts[i + 1];
      current[part] = /^\d+$/.test(nextPart) ? [] : {};
    }
    current = current[part];
  }

  const lastPart = pathParts[pathParts.length - 1];
  current[lastPart] = value;
}

function removeValueAtPath(obj: any, pathParts: string[]): void {
  if (pathParts.length === 0) {
    throw new Error('Cannot remove root path');
  }

  const parent = getValueAtPath(obj, pathParts.slice(0, -1));
  const lastPart = pathParts[pathParts.length - 1];

  if (Array.isArray(parent)) {
    const index = parseInt(lastPart, 10);
    if (isNaN(index)) {
      throw new Error(`Invalid array index: ${lastPart}`);
    }
    parent.splice(index, 1);
  } else {
    delete parent[lastPart];
  }
}


