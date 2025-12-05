/**
 * Context Builder for AI Jobs
 * 
 * Assembles the full context the AI needs to work effectively:
 * - System manifest (what the platform does)
 * - Golden Plan rules (what makes a valid mockup)
 * - Current plan state
 * - Chat history
 * - Iteration notes (with full mockup snapshots for revert)
 * - Verification criteria
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

// Simple, human system prompt - trust the LLM
const GOLDEN_PLAN_RULES = `
You're a designer friend helping someone build an app mockup.

Chat naturally. Pitch ideas when they're stuck. Generate mockups when the vision is clear. Don't ask for permission—just make things and let them react.

Keep it casual, keep it short, keep it real. Match their energy. If they say "yo", say "yo" back. If they're vague, suggest something cool. If they approve, build it.

When you generate mockups, make them production-ready:
- Dark theme (#0a0a0f background)
- Modern, clean design
- Real content, no lorem ipsum
- Mobile-friendly

You can generate HTML mockups, update them based on feedback, or revert to previous versions if they ask.
`;

interface MockupVersion {
  version: number;
  timestamp: string;
  html: string;
  summary: string;  // What changed
  score?: number;
}

interface PlanData {
  id: string;
  title?: string;
  description?: string;
  features?: string[];
  status?: string;
  ai_score?: number;
  current_mockup_html?: string;
  reference_html?: string; // NEW: Store user-provided HTML
  current_version?: number;
  design_system?: Record<string, unknown>;
  concept_name?: string;
  concept_summary?: string;
  concept_approved?: boolean;
  chat_history?: Array<{ role: string; content: string; timestamp?: string }>;
  mockup_versions?: MockupVersion[];  // Full version history
  iteration_notes?: Array<{ summary: string; timestamp: string }>;
}

export { PlanData, MockupVersion };

import { computeGoldenPlanStatus } from './golden-plan-checklist.ts';

export async function buildContext(planId: string, userMessage: string): Promise<{
  systemPrompt: string;
  planData: PlanData;
  error?: string;
}> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      global: {
        headers: { 'Cache-Control': 'no-store' }
      }
    }
  );

  // 1. Fetch plan data
  let planData: PlanData = { id: planId };
  let errorMsg: string | undefined;

  try {
    console.log(`📂 Loading plan: planblueprints/${planId}.json`);
    
    // Use Signed URL to bypass potential CDN caching issues
    const { data: signedData, error: signError } = await supabase.storage
      .from('content')
      .createSignedUrl(`planblueprints/${planId}.json`, 60);

    if (signError) {
        console.log(`❌ Signed URL error: ${signError.message}`);
        // Fallback to download if signing fails (unlikely)
        const { data: blob, error } = await supabase.storage
            .from('content')
            .download(`planblueprints/${planId}.json`);
        if (error) errorMsg = error.message;
        else if (blob) {
            const text = await blob.text();
            planData = { ...planData, ...JSON.parse(text) };
        }
    } else if (signedData?.signedUrl) {
        // Fetch with cache buster just in case
        const res = await fetch(signedData.signedUrl + `&t=${Date.now()}`);
        if (res.ok) {
            const text = await res.text();
            planData = { ...planData, ...JSON.parse(text) };
            console.log(`✅ Plan loaded via Signed URL. Title: ${planData.title}, History: ${planData.chat_history?.length || 0} msgs`);
        } else {
            console.log(`⚠️ Fetch failed: ${res.status} ${res.statusText}`);
            // 404 is expected for new plans
        }
    }
  } catch (e) {
    console.log('⚠️ Plan load failed (starting fresh):', e);
    errorMsg = String(e);
  }

  // 2. Fetch recent iteration notes
  const iterationNotes: string[] = [];
  try {
    const { data: files } = await supabase.storage
      .from('content')
      .list('iterationnotes', { limit: 5, sortBy: { column: 'created_at', order: 'desc' } });
    
    if (files) {
      for (const file of files.slice(0, 3)) {
        const { data: noteBlob } = await supabase.storage
          .from('content')
          .download(`iterationnotes/${file.name}`);
        if (noteBlob) {
          const note = JSON.parse(await noteBlob.text());
          if (note.plan_id === planId) {
            iterationNotes.push(`[${note.created_at}] ${note.summary}`);
          }
        }
      }
    }
  } catch (e) {
    // No notes yet
  }

  // 3. Build chat history summary
  const chatHistory = planData.chat_history || [];
  const recentChat = chatHistory.slice(-10).map(m => `${m.role}: ${m.content}`).join('\n');

  // 4. Build version history summary
  const versions = planData.mockup_versions || [];
  const versionSummary = versions.length > 0 
    ? versions.map(v => `  v${v.version} [${v.timestamp}]: ${v.summary} (${v.html.length} chars, score: ${v.score || '?'})`).join('\n')
    : 'No previous versions';

  // 5. Compute Golden Plan Status
  const goldenStatus = await computeGoldenPlanStatus(planData);

  // 6. Assemble full context
  const systemPrompt = `${GOLDEN_PLAN_RULES}

---

# CURRENT SESSION CONTEXT

## Plan State
- ID: ${planId}
- Title: ${planData.title || 'Untitled'}
- Description: ${planData.description || 'Not set'}
- Features: ${planData.features?.join(', ') || 'None defined'}
- Status: ${planData.status || 'draft'}
- AI Score: ${planData.ai_score || 0}/100
- Has Mockup: ${planData.current_mockup_html ? 'Yes (' + planData.current_mockup_html.length + ' chars)' : 'No'}
- Current Version: ${planData.current_version || 0}
${planData.design_system ? `- Design System: ${JSON.stringify(planData.design_system).substring(0, 200)}...` : ''}
${planData.concept_name ? `- Concept: ${planData.concept_name} (${planData.concept_approved ? 'Approved' : 'Pending approval'})` : ''}
${planData.concept_summary ? `- Concept Summary: ${planData.concept_summary}` : ''}

## Golden Plan Progress (OFFICIAL STATUS - DO NOT HALLUCINATE)
${goldenStatus.summary}
Current Official Score: ${goldenStatus.percentComplete}%

CRITICAL: You CANNOT just "make it 100%" by generating a mockup.
To reach 100%, the following technical checks MUST pass (you cannot skip them):
${goldenStatus.suggestions.map(s => `- ${s}`).join('\n')}

If the user asks for 100%, explain exactly what technical step is missing (e.g., "We need to run the CTA coverage test"). Do not pretend it is done.

## Mockup Version History
${versionSummary}

To revert: User can say "revert to version X" or "go back to version X"

## Recent Conversation (last 10 messages)
${recentChat || 'No previous messages'}

## Iteration Notes
${iterationNotes.length > 0 ? iterationNotes.join('\n') : 'No previous iterations'}

## Current User Message
"${userMessage}"

---

Based on all this context, respond helpfully. Remember:
- You have full context of the plan and conversation history
- You can generate mockups when ready
- You know the validation rules
- You can revert to any previous version if user asks
- Be proactive and helpful!`;

  return { systemPrompt, planData };
}

export async function saveChat(
  planId: string, 
  planData: PlanData, 
  userMessage: string, 
  aiResponse: string
): Promise<void> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      global: {
        headers: { 'Cache-Control': 'no-store' }
      }
    }
  );

  // Add messages to chat history
  const chatHistory = planData.chat_history || [];
  chatHistory.push(
    { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
    { role: 'assistant', content: aiResponse, timestamp: new Date().toISOString() }
  );

  // Keep last 50 messages
  const trimmedHistory = chatHistory.slice(-50);

  let referenceHtml = planData.reference_html;
  if (!referenceHtml) {
    const htmlBlocks = extractInlineHtml(userMessage);
    if (htmlBlocks.length > 0) {
      referenceHtml = htmlBlocks.join("\n\n");
      console.log(`📎 Captured reference_html in saveChat (${referenceHtml.length} chars)`);
    }
  }

  // Update plan with chat history
  const updatedPlan = { ...planData, chat_history: trimmedHistory, reference_html: referenceHtml };
  
  console.log(`💾 Saving chat to planblueprints/${planId}.json...`);
  if (planData.reference_html) {
    console.log(`📎 reference_html length: ${planData.reference_html.length}`);
  }
  const { error } = await supabase.storage
    .from('content')
    .upload(`planblueprints/${planId}.json`, JSON.stringify(updatedPlan), { 
      upsert: true, 
      contentType: 'application/json' 
    });
    
  if (error) {
    console.error(`❌ Error saving chat: ${error.message}`);
    throw error;
  }
  console.log(`✅ Chat saved successfully.`);
}

/**
 * Save a new mockup version (called when mockup changes)
 */
export async function saveMockupVersion(
  planId: string,
  planData: PlanData,
  newHtml: string,
  summary: string,
  score?: number
): Promise<PlanData> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      global: {
        headers: { 'Cache-Control': 'no-store' }
      }
    }
  );

  const baselineAnchors = new Set<string>();
  if (planData.reference_html) {
    extractDataAnchors(planData.reference_html).forEach((anchor) => baselineAnchors.add(anchor));
  }
  if (planData.current_mockup_html) {
    extractDataAnchors(planData.current_mockup_html).forEach((anchor) => baselineAnchors.add(anchor));
  }

  if (baselineAnchors.size) {
    const missingAnchors = Array.from(baselineAnchors).filter((anchor) => !newHtml.includes(anchor));
    if (missingAnchors.length) {
      const preview = missingAnchors.slice(0, 5).join(", ");
      console.error(`❌ Reference HTML guard triggered. Missing anchors: ${preview}`);
      throw new Error(
        `REFERENCE_HTML_GUARD: Claude removed baseline markup (${preview}${
          missingAnchors.length > 5 ? "…" : ""
        }). Ask the assistant to adopt your HTML verbatim and only patch requested parts.`
      );
    }
  }

  const versions = planData.mockup_versions || [];
  const newVersion = (planData.current_version || 0) + 1;

  // Add new version
  versions.push({
    version: newVersion,
    timestamp: new Date().toISOString(),
    html: newHtml,
    summary,
    score
  });

  // Keep last 20 versions (to avoid bloat)
  const trimmedVersions = versions.slice(-20);

  // Update plan
  const updatedPlan: PlanData = {
    ...planData,
    current_mockup_html: newHtml,
    current_version: newVersion,
    mockup_versions: trimmedVersions,
    ai_score: score || planData.ai_score
  };

  await supabase.storage
    .from('content')
    .upload(`planblueprints/${planId}.json`, JSON.stringify(updatedPlan), { 
      upsert: true, 
      contentType: 'application/json' 
    });

  return updatedPlan;
}

/**
 * Revert to a previous mockup version
 */
export async function revertToVersion(
  planId: string,
  planData: PlanData,
  targetVersion: number
): Promise<{ success: boolean; message: string; planData?: PlanData }> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      global: {
        headers: { 'Cache-Control': 'no-store' }
      }
    }
  );

  const versions = planData.mockup_versions || [];
  const targetVersionData = versions.find(v => v.version === targetVersion);

  if (!targetVersionData) {
    return { 
      success: false, 
      message: `Version ${targetVersion} not found. Available versions: ${versions.map(v => v.version).join(', ')}` 
    };
  }

  // Create a new version that is a copy of the target (so we don't lose history)
  const newVersion = (planData.current_version || 0) + 1;
  versions.push({
    version: newVersion,
    timestamp: new Date().toISOString(),
    html: targetVersionData.html,
    summary: `Reverted to version ${targetVersion}`,
    score: targetVersionData.score
  });

  const updatedPlan: PlanData = {
    ...planData,
    current_mockup_html: targetVersionData.html,
    current_version: newVersion,
    mockup_versions: versions.slice(-20),
    ai_score: targetVersionData.score || planData.ai_score
  };

  await supabase.storage
    .from('content')
    .upload(`planblueprints/${planId}.json`, JSON.stringify(updatedPlan), { 
      upsert: true, 
      contentType: 'application/json' 
    });

  return { 
    success: true, 
    message: `Reverted to version ${targetVersion}. Now at version ${newVersion}.`,
    planData: updatedPlan
  };
}

/**
 * Get version diff (for showing what changed)
 */
export function getVersionDiff(planData: PlanData, v1: number, v2: number): {
  v1Summary: string;
  v2Summary: string;
  v1Length: number;
  v2Length: number;
} | null {
  const versions = planData.mockup_versions || [];
  const version1 = versions.find(v => v.version === v1);
  const version2 = versions.find(v => v.version === v2);

  if (!version1 || !version2) return null;

  return {
    v1Summary: version1.summary,
    v2Summary: version2.summary,
    v1Length: version1.html.length,
    v2Length: version2.html.length
  };
}

function extractInlineHtml(content: string): string[] {
  if (!content) return [];
  const blocks: string[] = [];
  const docTypeRegex = /<!DOCTYPE html[\s\S]*?<\/html>/gi;
  let match: RegExpExecArray | null;

  while ((match = docTypeRegex.exec(content)) !== null) {
    blocks.push(match[0]);
  }

  if (blocks.length > 0) return blocks;

  const htmlRegex = /<html[\s\S]*?<\/html>/gi;
  while ((match = htmlRegex.exec(content)) !== null) {
    blocks.push(match[0]);
  }

  return blocks;
}

function extractDataAnchors(html: string): string[] {
  if (!html) return [];
  const anchors = new Set<string>();
  const attrRegex =
    /data-(cta-id|page-id|section-id|cta-block|screen-id)="([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(html)) !== null) {
    anchors.add(`${match[0]}`);
  }
  return Array.from(anchors);
}

