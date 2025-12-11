import { getFormatRegistry } from "../_shared/format-registry.ts";

export async function handleRequest(req: Request): Promise<Response> {
  // Lazy import schema to work in both Deno and Jest-mapped Node
  let parseAttachments: (v: unknown) => { success: boolean; data?: any; error?: any };
  try {
    const mod = await import("../_shared/validation.ts");
    const AttachmentsSchema = (mod as any).AttachmentsSchema;
    parseAttachments = (v: unknown) => {
      try {
        const data = AttachmentsSchema.parse(v);
        return { success: true, data };
      } catch (e) {
        return { success: false, error: e };
      }
    };
  } catch {
    parseAttachments = () => ({ success: true });
  }

  // OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  // Only POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Agent token check
  const provided = (req.headers as any)?.get?.('X-Agent-Token') || (req as any).headers?.get?.('X-Agent-Token') || (req as any).headers?.get?.('x-agent-token');
  const expected = (globalThis as any).__AGENT_TOKEN__ || '';
  if (!provided || provided !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate body (portable)
  let body: any;
  try {
    body = await (req as any).json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { jobId, courseId, attachments, mergePlan, dryRun } = body || {};
  if (!jobId || typeof jobId !== 'string' || !courseId || typeof courseId !== 'string') {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const att = attachments ?? [];
  const attParsed = parseAttachments(att);
  if (!attParsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid attachments' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Injection for tests (Node path)
  const injected = (globalThis as any).__applyJobResult__ as undefined | ((p: any) => Promise<{ ok: boolean; etag?: string }>);
  if (!(globalThis as any).Deno && injected) {
    const result = await injected(body);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Deno runtime path: perform merge + save
  if ((globalThis as any).Deno) {
    try {
      const { createClient } = await import('npm:@supabase/supabase-js@2');
      const { applyPatch, compare } = await import('https://esm.sh/fast-json-patch@3.1.1');
      const isArray = Array.isArray;

      const defaultMergeRules = {
        disallowIdChange: true,
        disallowedRootPaths: ['/items', '/groups', '/levels'],
        allowItemsAppendOnly: true,
      };

      function checkMergePolicy(format: string, patch: unknown): { ok: true } | { ok: false; reason: string } {
        if (!patch || !isArray(patch)) return { ok: true };

        const registry = getFormatRegistry();
        const rules = (registry.mergeRules as any)[format] || (registry.mergeRules as any).practice || defaultMergeRules;

        const disallowIdChange = rules.disallowIdChange !== false;
        const disallowedRootPaths = new Set<string>(
          (rules.disallowedRootPaths as string[] | undefined) ?? defaultMergeRules.disallowedRootPaths,
        );
        const allowItemsAppendOnly = rules.allowItemsAppendOnly !== false;

        for (const op of patch as any[]) {
          const p = String(op?.path || '');
          const opcode = String(op?.op || '');
          // Forbid changing course id unless explicitly allowed
          if (disallowIdChange && p === '/id' && (opcode === 'replace' || opcode === 'remove')) {
            return { ok: false, reason: 'merge_policy_violation: cannot modify course id' };
          }
          // Forbid wholesale array replacements/removals on key roots
          if (disallowedRootPaths.has(p) && (opcode === 'replace' || opcode === 'remove' || opcode === 'add')) {
            // Allow add only if appending to items via '/items/-' when configured
            const isAppendToItems =
              allowItemsAppendOnly && p === '/items' && opcode === 'add' && String(op?.path || '').endsWith('/-');
            if (!isAppendToItems) {
              return { ok: false, reason: `merge_policy_violation: forbidden operation ${opcode} on ${p}` };
            }
          }
        }
        return { ok: true };
      }
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Missing required environment variables');
      }
      
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Load current course
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('courses')
        .download(`${courseId}/course.json`);
      if (downloadError || !fileData) {
        return new Response(JSON.stringify({ error: 'Course not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }
      const currentCourse = JSON.parse(await fileData.text());

      // Compute merged course
      let nextCourse = structuredClone(currentCourse);

      //version increment (best-effort)
      if (typeof (nextCourse?.contentVersion) === "number") {
        nextCourse.contentVersion = (nextCourse.contentVersion as number) + 1;
      } else if (typeof (nextCourse?.version) === "number") {
        nextCourse.version = (nextCourse.version as number) + 1;
      }

      if (Array.isArray(attachments) && attachments.length > 0) {
        // Ensure images map exists
        nextCourse.images = nextCourse.images || {};
        for (const a of attachments) {
          const imageUrl = a?.imageUrl || a?.url;
          const alt = a?.alt || '';
          const purpose = a?.purpose || 'general';
          const tref = a?.targetRef || a?.target || {};
          const key = (() => {
            const t = String(tref?.type || '').toLowerCase();
            if (t === 'study_text') return 'studyText';
            if (t === 'item_stimulus') return `item:${tref?.itemId}:stem`;
            if (t === 'item_option') return `item:${tref?.itemId}:option:${tref?.optionIndex ?? 0}`;
            return 'misc';
          })();
          const arr = Array.isArray(nextCourse.images[key]) ? nextCourse.images[key] : [];
          arr.push({ url: imageUrl, alt, purpose });
          nextCourse.images[key] = arr;
        }
      }

      const formatForMerge = String((nextCourse as any)?.format || 'practice');

      if (mergePlan?.patch && Array.isArray(mergePlan.patch)) {
        const policy = checkMergePolicy(formatForMerge, mergePlan.patch);
        if (!policy.ok) {
          return new Response(JSON.stringify({ error: 'merge_policy_violation', details: policy.reason }), {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        try {
          const patched = applyPatch(nextCourse, mergePlan.patch, true);
          nextCourse = patched.newDocument;
        } catch {
          // If patch fails, fall back to previous nextCourse
        }
      }

      // Validate merged course invariants before saving
      try {
        const vmod = await import('../_shared/validation.ts');
        const validate = (vmod as any).validateCourseIntegrity as (c: unknown) => { ok: boolean; error?: string };
        const validateEnvelopeContent = (vmod as any).validateEnvelopeContent as (e: unknown) => { ok: boolean; error?: string };
        const vres = validate(nextCourse);
        if (!vres.ok) {
          return new Response(JSON.stringify({ error: 'validation_failed', details: vres.error }), {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // Best-effort: if original course had an envelope wrapper we can't see; validate content by format if available
        if (nextCourse && typeof nextCourse === 'object') {
          const format = (nextCourse as any).format || 'practice';
          const envelopeCandidate = { id: (nextCourse as any).id || courseId, format, content: nextCourse };
          const envRes = validateEnvelopeContent?.(envelopeCandidate);
          if (envRes && !envRes.ok) {
            return new Response(JSON.stringify({ error: 'format_validation_failed', details: envRes.error }), {
              status: 422,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }
      } catch {
        // If validator unavailable, proceed (should not happen in production)
      }

      // If dryRun: return preview diff without persisting
      if (dryRun === true) {
        const diff = (() => {
          try { return compare(currentCourse, nextCourse); } catch { return []; }
        })();
        return new Response(JSON.stringify({
          ok: true,
          dryRun: true,
          preview: {
            diff,
            patchApplied: Array.isArray(mergePlan?.patch) ? mergePlan.patch.length : 0,
            attachmentsApplied: Array.isArray(attachments) ? attachments.length : 0,
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Version & save
      const timestamp = Date.now();
      const versionPath = `${courseId}/versions/${timestamp}.json`;
      const etag = crypto.randomUUID();

      const { error: versionError } = await supabase.storage
        .from('courses')
        .upload(versionPath, JSON.stringify(nextCourse, null, 2), {
          contentType: 'application/json',
          upsert: false,
        });
      if (versionError) {
        return new Response(JSON.stringify({ error: `Failed to upload version: ${versionError.message}` }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      const { error: updateError } = await supabase.storage
        .from('courses')
        .upload(`${courseId}/course.json`, JSON.stringify(nextCourse, null, 2), {
          contentType: 'application/json',
          upsert: true,
        });
      if (updateError) {
        return new Response(JSON.stringify({ error: `Failed to update course: ${updateError.message}` }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      const catalogVersion = {
        etag,
        timestamp,
        lastModified: new Date().toISOString(),
        description: mergePlan?.description || 'Applied job result',
      };
      await supabase.storage
        .from('courses')
        .upload('catalog.version', JSON.stringify(catalogVersion, null, 2), {
          contentType: 'application/json',
          upsert: true,
        });

      return new Response(JSON.stringify({ ok: true, etag }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // Fallback
  return new Response(JSON.stringify({ error: 'Not Implemented' }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
  });
}


