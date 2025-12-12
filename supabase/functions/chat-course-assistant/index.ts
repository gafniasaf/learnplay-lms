import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonOk, jsonError } from "../_shared/error.ts";
import { withCors } from "../_shared/cors.ts";
import { logInfo, logError } from "../_shared/log.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_CHAT_MODEL = Deno.env.get("OPENAI_CHAT_MODEL") || "gpt-4-turbo";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-3-5-sonnet-20241022";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables");
}

interface ChatRequest {
  previewId?: string;
  message: string;
  currentPreview?: any;
  conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
}

interface ChatResponse {
  message: string;
  actions?: Array<{
    id: string;
    label: string;
    variant?: string;
   }>;
  previewUpdates?: Array<{
    type: string;
    targetId: string;
    description: string;
    changes: Record<string, unknown>;
  }>;
  cost?: number;
  metadata?: Record<string, unknown>;
}

/**
 * System prompt for course authoring assistant
 */
const SYSTEM_PROMPT = `You are an expert educational content designer helping teachers create courses.

Your role:
- Understand course creation requests in natural language
- Generate complete course previews with exercises, study texts, and multimedia
- Suggest improvements and alternatives
- Explain your decisions and trade-offs (cost, quality, time)
- NEVER commit to database without explicit user approval
- Always show cost estimates before generating multimedia
- Recommend best providers based on use case
- Detect and prevent duplicate content

Guidelines:
- Be conversational and friendly
- Ask clarifying questions when needed
- Offer alternatives (cheaper/faster/better)
- Explain educational rationale
- Keep responses concise but informative
- Use emojis sparingly for clarity

When user says:
- "Create a course about X" → Ask grade, items, multimedia preferences
- "Make this easier" → Simplify language, add hints, reduce complexity
- "Add more images" → Identify good candidates, estimate cost, get approval
- "Publish" → Confirm, execute, report success

Cost awareness:
- Always estimate before generating
- Warn if costs exceed $1.00
- Suggest cheaper alternatives when appropriate
- Track total spend per session

Current capabilities:
- Generate courses with study texts
- Add images via DALL-E 3 ($0.04 each) or Stable Diffusion ($0.01 each)
- Add audio via OpenAI TTS ($0.015 per 1K characters)
- Modify items (text, difficulty, hints, options)
- Add/remove content

You CANNOT:
- Access external websites
- Generate videos yet (coming soon)
- Edit courses directly in database (only preview)

Always respond in a helpful, educational tone.`;

/**
 * Available functions for the AI
 */
const CHAT_FUNCTIONS = [
  {
    name: "generate_course_preview",
    description: "Generate a complete course preview with all content and multimedia",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Course subject" },
        grade: { type: "string", description: "Target grade level" },
        items_per_group: { type: "number", description: "Number of items per group" },
        include_study_texts: { type: "boolean", description: "Include study texts" },
        include_images: { type: "boolean", description: "Generate images" },
        image_count_estimate: { type: "number", description: "Estimated number of images" },
      },
      required: ["subject", "grade", "items_per_group"],
    },
  },
  {
    name: "modify_item",
    description: "Modify a specific exercise item",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "number", description: "Item ID to modify" },
        make_easier: { type: "boolean", description: "Simplify the item" },
        make_harder: { type: "boolean", description: "Make more challenging" },
        new_text: { type: "string", description: "New question text" },
        add_hint: { type: "string", description: "Hint to add" },
        add_image: { type: "boolean", description: "Add image stimulus" },
      },
      required: ["item_id"],
    },
  },
  {
    name: "estimate_cost",
    description: "Estimate cost for planned changes",
    parameters: {
      type: "object",
      properties: {
        images: { type: "number", description: "Number of images" },
        audio_chars: { type: "number", description: "Audio character count" },
        videos: { type: "number", description: "Number of videos" },
        provider: { type: "string", description: "Provider to use" },
      },
    },
  },
];

Deno.serve(withCors(async (req) => {
  const requestId = crypto.randomUUID();
  const ctx = { requestId, functionName: "chat-course-assistant" };

  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      error: { code: "method_not_allowed", message: "Method not allowed" },
      requestId,
      timestamp: new Date().toISOString(),
    }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { message, currentPreview, conversationHistory }: ChatRequest = await req.json();
    let lastProviderError: { provider: string; status?: number; text?: string; model?: string } | null = null;

    if (!message || message.trim().length === 0) {
      return new Response(JSON.stringify({
        error: { code: "missing_message", message: "Message is required" },
        requestId,
        timestamp: new Date().toISOString(),
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    logInfo("Chat request received", { ...ctx, messageLength: message.length });

    // Intercept simple model identity queries to avoid hallucinated claims
    const modelQuery = /(which|what)\s+(ai\s+)?(model|gpt|openai|claude)/i;
    if (modelQuery.test(message)) {
      return new Response(JSON.stringify({
        message: `I'm using Anthropic Claude Sonnet 4.5 for this chat.`,
        metadata: { provider: 'anthropic', model: ANTHROPIC_MODEL },
        requestId,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // Check if any provider is available
    if (!ANTHROPIC_API_KEY && !OPENAI_API_KEY) {
      return new Response(JSON.stringify({
        message: "I'm currently offline. No AI provider is configured. Please contact your administrator.",
        metadata: { provider: 'none', error: 'no_provider' },
        requestId,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build conversation with system prompt
    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...(conversationHistory || []),
      { role: "user" as const, content: message },
    ];

    // Add preview context if available
    if (currentPreview) {
      messages.splice(1, 0, {
        role: "system" as const,
        content: `Current preview course: ${JSON.stringify({
          id: currentPreview.id,
          title: currentPreview.title,
          items: currentPreview.items?.length || 0,
          studyTexts: currentPreview.studyTexts?.length || 0,
          totalCost: currentPreview.totalCost || 0,
        })}`,
      });
    }

    // Prefer Anthropic first if key is present
    if (ANTHROPIC_API_KEY) {
      try {
        const anthropicSystem = (() => {
          const base = SYSTEM_PROMPT;
          if (!currentPreview) return base;
          const extra = `\n\nCurrent preview course: ${JSON.stringify({
            id: currentPreview.id,
            title: currentPreview.title,
            items: currentPreview.items?.length || 0,
            studyTexts: currentPreview.studyTexts?.length || 0,
            totalCost: currentPreview.totalCost || 0,
          })}`;
          return base + extra;
        })();

        const mapMsg = (m: { role: string; content: string }) => ({
          role: m.role === 'user' ? 'user' as const : 'assistant' as const,
          content: [{ type: 'text', text: m.content }]
        });
        const filteredHistory = (conversationHistory || []).filter(m => m.role !== 'system');
        const anthroMessages = [
          ...filteredHistory.map(mapMsg),
          { role: 'user' as const, content: [{ type: 'text', text: message }] },
        ];

        // Heuristic max tokens: planning/generation gets more, general chat less
        const isPlanning = /\b(generate|create|plan|course|preview)\b/i.test(message);
        const maxTk = isPlanning ? 1400 : 1024;

        const models = [ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"].filter(Boolean) as string[];
        let lastErr: { status?: number; text?: string; model?: string } | undefined;
        for (const model of models) {
          const aResp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": ANTHROPIC_API_KEY,
              "content-type": "application/json",
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model,
              max_tokens: maxTk,
              temperature: 0.7,
              system: anthropicSystem,
              messages: anthroMessages,
            }),
            signal: AbortSignal.timeout(60000),
          });

          if (aResp.ok) {
            const aData = await aResp.json();
            const text = (aData?.content || [])
              .filter((b: any) => b?.type === "text" && b?.text)
              .map((b: any) => b.text)
              .join("\n\n");

            if (text && text.trim()) {
              // Heuristic intent detection: propose Generate Preview action when user asked to create a course
              const deriveParams = (msg: string) => {
                const m = (msg || '').toLowerCase();

                // Build additional context from recent USER messages in the conversation
                const userHist = (conversationHistory || [])
                  .filter((h) => h.role === 'user' && typeof h.content === 'string')
                  .map((h) => h.content.toLowerCase())
                  .slice(-5) // last few user turns
                  .join(' \n ');
                const ctx = `${userHist} ${m}`;

                // Intent: any mention of creating/generating a course across recent context
                const wantsCourse = /(create|generate|make|build|design)\b.*\bcourse\b/.test(ctx)
                  || /\bcourse (about|on)\b/.test(ctx)
                  || /\bgenerate\s+preview\b/.test(ctx)
                  || /\bpublish\b/.test(ctx)
                  || /\bpreview\b/.test(ctx);

                // Grade extraction: "grade 1", "1st grade", "k/kindergarten"
                let grade: string | undefined;
                const g1 = ctx.match(/\bgrade\s*(k|[0-9]{1,2})\b/i);
                const g2 = ctx.match(/\b(kg|k|kindergarten)\b/i);
                const g3 = ctx.match(/\b([1-9][0-2]?)\s*(?:st|nd|rd|th)?\s*grade\b/i);
                if (g1) grade = g1[1].toString().toLowerCase() === 'k' ? 'kindergarten' : `grade_${g1[1]}`;
                else if (g2) grade = 'kindergarten';
                else if (g3) grade = `grade_${g3[1]}`;

                // Subject extraction (try "course about X" first, else text before the word course)
                let subject: string | undefined;
                const subjAbout = ctx.match(/course (?:about|on)\s+([^,\n]+)(?:,|\.|$)/i);
                if (subjAbout) {
                  subject = subjAbout[1].trim();
                } else {
                  const subjBeforeCourse = ctx.match(/(?:create|generate|make|build|design)[^.\n]*?\b([a-z0-9\s\-]{3,})\s+course\b/i);
                  if (subjBeforeCourse) {
                    let candidate = subjBeforeCourse[1];
                    candidate = candidate.replace(/\b(grade|grades?)\s*[a-z0-9\-]+/gi, '').trim();
                    candidate = candidate.replace(/\b(k|kg|kindergarten)\b/gi, '').trim();
                    subject = candidate.trim();
                  }
                }
                if (subject) {
                  subject = subject.replace(/\s{2,}/g, ' ').replace(/[^a-z0-9 \-]/g, '').trim();
                }

                // Items per group
                const itemsMatch = ctx.match(/(\d{1,2})\s*(items|questions|exercises|problems)/i);
                const items = itemsMatch ? parseInt(itemsMatch[1], 10) : 10;

                // Levels
                const lvMatch = ctx.match(/(\d{1,2})\s*levels?/i);
                const levels = lvMatch ? Math.max(1, Math.min(10, parseInt(lvMatch[1], 10))) : undefined;

                // Study texts / media flags
                const wantTexts = /(?:study\s*texts?|text(?:s)?)/i.test(ctx);
                const noMedia = /no\s*(media|multimedia|images?)/i.test(ctx);

                // If user intends a course but we couldn't extract subject/grade, provide sane defaults so the UI can show the button
                if (!wantsCourse) return null;

                // Require minimal completeness before enabling generation
                const hasSubject = !!subject && subject.length >= 3 && subject !== 'general';
                const hasGrade = !!grade;
                const hasItems = !!itemsMatch;
                if (!(hasSubject && hasGrade && hasItems)) {
                  return null;
                }

                return {
                  subject: subject!,
                  grade: grade!,
                  items_per_group: items,
                  levels_count: levels,
                  include_study_texts: wantTexts ? true : true,
                  include_images: noMedia ? false : false,
                  image_count_estimate: 0,
                };
              };
              const genParams = deriveParams(message);
              const result: ChatResponse = {
                message: text,
                metadata: { provider: "anthropic", model, tokens: aData?.usage?.output_tokens, ...(genParams ? { generationParams: genParams } : {}) },
                actions: genParams ? [
                  { id: 'approve-generation', label: 'Generate Preview', variant: 'default' },
                  { id: 'modify-plan', label: 'Modify Plan', variant: 'outline' },
                ] : undefined,
              };
              return new Response(JSON.stringify({ ...result, requestId }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }
          } else {
            const t = await aResp.text();
            lastErr = { status: aResp.status, text: t, model };
            lastProviderError = { provider: 'anthropic', ...lastErr };
            logError("Anthropic API failed", new Error(`${model}: ${t}`), ctx);
          }
        }
        if (lastErr) {
          logError("Anthropic all models failed", new Error(`${lastErr.model}: ${lastErr.status} ${lastErr.text}`), ctx);
        }
      } catch (e) {
        logError("Anthropic call error", e as Error, ctx);
      }
    }

    // If we get here, Anthropic was not used or failed; return a friendly message
    return new Response(JSON.stringify({
      message: "I'm having trouble reaching the AI provider right now. Please try again shortly.",
      metadata: { provider: 'anthropic', error: 'anthropic_unavailable', lastProviderError },
      requestId,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    await logError("Chat assistant error", error as Error, { requestId, functionName: "chat-course-assistant" });
    return new Response(JSON.stringify({
      error: { code: "chat_error", message: `Chat error: ${(error as Error).message}` },
      requestId,
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}));


