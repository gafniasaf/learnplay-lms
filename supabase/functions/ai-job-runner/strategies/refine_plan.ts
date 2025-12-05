import { JobExecutor, JobContext } from './types.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildContext, saveChat, saveMockupVersion, revertToVersion, PlanData } from '../context-builder.ts';
import { computeGoldenPlanStatus } from '../golden-plan-checklist.ts';

export class RefinePlan implements JobExecutor {
  async execute(context: JobContext): Promise<any> {
    const { payload } = context;
    const planId = payload.planBlueprintId;
    const userMessage = payload.ai_request || "What should we work on?";
    const approvalRegex = /(build( it)?|ship( it)?|send it|go ahead|do it|make it|get it done|proceed|start building|start the mockup|stop talking|get to work|looks good|sounds good|love it|awesome, do it)/i;

    if (!planId) throw new Error("Missing planBlueprintId");
    
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    
    if (!openaiKey) throw new Error("BLOCKED: OPENAI_API_KEY is missing");

    // 1. Get Context (Plan + History)
    const { planData, error: loadError } = await buildContext(planId, userMessage);
    let updatedPlan = { ...planData };
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      {
        global: {
          headers: { 'Cache-Control': 'no-store' }
        }
      }
    );

    // 1b. Detect inline HTML references in the user request
    const extractedHtml = extractHtmlBlocks(userMessage);
    if (extractedHtml.length > 0) {
        const combinedHtml = extractedHtml.join("\n\n");
        updatedPlan.reference_html = combinedHtml;
        console.log(`📥 Captured reference HTML (${combinedHtml.length} chars, ${extractedHtml.length} block(s))`);
    }

    // Compute status EARLY to inject into prompt
    let initialProgress;
    try {
        initialProgress = await computeGoldenPlanStatus(updatedPlan);
    } catch (e) {
        console.error("Failed to compute status:", e);
        initialProgress = { 
            summary: "Status unavailable", 
            percentComplete: 0, 
            suggestions: ["Check backend logs"] 
        };
    }

    // 2. THE V2 SYSTEM PROMPT (Proven to be human)
    const hasReferenceHtml = !!updatedPlan.reference_html?.trim();
    const referenceHtmlLength = updatedPlan.reference_html?.length || 0;
    const referenceHtmlDirective = hasReferenceHtml
        ? `REFERENCE HTML PROVIDED (≈${referenceHtmlLength} chars). This is the user's canonical baseline. ALWAYS acknowledge it explicitly (e.g. "I'll use your HTML baseline as-is") before suggesting anything else. Extend or tweak it only after confirming what should change. If it looks incomplete, ask which sections are missing before generating new markup.`
        : `No reference HTML provided yet. You'll need to outline ideas and confirm the plan before generating mockups.`;

    const systemPrompt = `You are a chill UI designer friend helping someone build an app mockup.

PERSONALITY:
- Match their energy. If they say "yo", say "yo" back.
- Use contractions. Keep it short and punchy.
- Be specific, not generic.

CONVERSATION FLOW (Consultative):
- ${referenceHtmlDirective}
- If the user provides documentation or raw HTML: summarize the plan, confirm what it covers, and ask how they want to use it.
- Default to CHAT. Don't build until you're sure.
- If they greet you, ask what they want to build.
- If they describe an idea, ASK questions to clarify the vibe/features before building.
- ONLY generate a mockup if the user says "build it", "make it", "show me", or confirms explicitly ("yes", "go ahead").
- If they say "sounds cool" or "I like that", treat it as agreement to the IDEA, not a command to build. Ask: "Want me to mock that up?"
- When reference HTML exists, acknowledge it verbatim ("I'll use your HTML baseline") before talking about next steps.
- If the HTML feels incomplete (missing screens/sections), ask which parts need to be filled before building anything new.
- If the user asks about guard plan checks, explicitly mention "guard plan" in your response and describe what still needs to happen before it passes.

CONTEXT:
- Current Plan: ${updatedPlan.title || "Untitled"}
- Description: ${updatedPlan.description || "None"}
- Has Mockup: ${!!planData.current_mockup_html}
- Reference HTML Provided: ${updatedPlan.reference_html ? "Yes" : "No"}

## Golden Plan Progress
Progress: ${initialProgress.percentComplete}%

If the user says "build it", "make it", or "proceed", generate the mockup immediately. Do not ask for permission if they have already given it.
If the user provides HTML, use it.

Output JSON (Example):
{
  "reasoning": "Step-by-step thought process (e.g. 'User provided HTML, need to extract and merge...')",
  "response": "Your casual reply",
  "action": "chat" | "generate_mockup" | "update_mockup" | "revert",
  "title": "The App Name",
  "description": "The App Description",
  "features": ["feature1", "feature2"],
  "mockup_instructions": "Instructions for Claude if generating",
  "revert_to_version": null
}`;

    // 3. Build messages array with full chat history
    const chatHistory = updatedPlan.chat_history || [];
    const messages: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt }
    ];
    
    // Add previous conversation (last 10 messages for context)
    for (const msg of chatHistory.slice(-10)) {
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      });
    }
    
    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    // 4. Call GPT-4o
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5',
        messages,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`GPT error: ${err}`);
    }

    const data = await response.json();
    const decision = JSON.parse(data.choices[0].message.content);
    
    console.log(`🎯 Decision: ${decision.action} - ${decision.response}`);

    // 4. Apply Updates
    if (decision.title) updatedPlan.title = decision.title;
    if (decision.description) updatedPlan.description = decision.description;
    if (decision.features) updatedPlan.features = decision.features;

    // Map concept fields so the Golden Plan checklist can progress
    if (updatedPlan.title) {
        updatedPlan.concept_name = updatedPlan.title;
    }
    if (updatedPlan.description) {
        updatedPlan.concept_summary = updatedPlan.description;
    }
    const userApprovedIdea = approvalRegex.test(userMessage);
    if (userApprovedIdea || decision.action === 'generate_mockup' || decision.action === 'update_mockup') {
        updatedPlan.concept_approved = true;
    }

    // 5. Handle Revert
    if (decision.action === 'revert' && decision.revert_to_version) {
        const revertResult = await revertToVersion(planId, planData, decision.revert_to_version);
        await saveChat(planId, revertResult.planData || planData, userMessage, decision.response);
        return {
            summary: decision.response,
            mockup_generated: false,
            reverted: true,
            updated_plan_fields: {
                ai_next_step: decision.response,
                ai_status_report: `Reverted to v${decision.revert_to_version}`
            }
        };
    }

    // 6. Handle Mockup (Claude Sonnet 4.5)
    let mockupGenerated = false;
    if ((decision.action === 'generate_mockup' || decision.action === 'update_mockup') && anthropicKey) {
        console.log(`🎨 Generating mockup with Claude...`);
        
        const mockupPrompt = `You are an expert UI developer. Create a complete, production-ready HTML mockup.

PRODUCT: ${updatedPlan.title}
DESCRIPTION: ${updatedPlan.description}
FEATURES: ${JSON.stringify(updatedPlan.features)}
INSTRUCTIONS: ${decision.mockup_instructions}

${decision.action === 'update_mockup' && planData.current_mockup_html ? `
EXISTING MOCKUP:
${planData.current_mockup_html.substring(0, 5000)}
` : ''}

${updatedPlan.reference_html ? `
REFERENCE HTML FROM USER (treat as canonical baseline—extend it rather than replacing it):
${updatedPlan.reference_html.substring(0, 20000)}
` : ''}

REQUIREMENTS:
- Full <style> block (dark theme #0a0a0f)
- <div class="mockup-app"> container
- Real content
- Mobile responsive

Output ONLY the HTML.`;

        const mockupResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5',
                max_tokens: 8192,
                messages: [{ role: 'user', content: mockupPrompt }]
            })
        });

        if (mockupResponse.ok) {
            const mockupResult = await mockupResponse.json();
            const rawHtml = mockupResult?.content?.[0]?.text;
            if (typeof rawHtml === 'string') {
                const styleStart = rawHtml.indexOf('<style>');
                const lastDiv = rawHtml.lastIndexOf('</div>');
                
                if (styleStart !== -1 && lastDiv !== -1) {
                    const newHtml = rawHtml.substring(styleStart, lastDiv + 6);
                    const versionSummary = decision.action === 'update_mockup' ? 'Updated mockup' : 'New mockup';
                    
                    updatedPlan = await saveMockupVersion(planId, updatedPlan, newHtml, versionSummary, undefined);
                    mockupGenerated = true;
                } else {
                    console.error("Claude mockup response missing <style>/<div> boundaries.");
                }
            } else {
                console.error("Claude mockup response missing text payload.");
            }
        }
    }

    // 7. Save & Return
    const progress = await computeGoldenPlanStatus(updatedPlan);
    updatedPlan.ai_score = progress.percentComplete;
    let aiResponseText = typeof decision.response === 'string' ? decision.response : "Pending next step";
    if (typeof aiResponseText === "string") {
        aiResponseText = aiResponseText
            .replace(/<details>[\s\S]*?<\/details>\s*/gi, "")
            .replace(/📝\s*\*\*Plan Updated:[\s\S]*/i, "")
            .trim();
    }
    updatedPlan.ai_status_report = mockupGenerated ? `v${updatedPlan.current_version} ready` : aiResponseText.substring(0, 30);
    updatedPlan.ai_next_step = aiResponseText;

    // Always save chat
    await saveChat(planId, updatedPlan, userMessage, decision.response);
    console.log(`💾 Saved chat. Total messages now: ${(updatedPlan.chat_history?.length || 0) + 2}`);

    let responseText = aiResponseText;
const userAskedGuardPlan = /guard plan/i.test(userMessage);
const userFrustrated = /(looks like shit|frustrating|hate this|awful|terrible|angry)/i.test(userMessage);
const userAskedPlanSummary = /(progress update|plan markdown|markdown summary|plan recap|refresh the plan)/i.test(userMessage);

    if (decision.reasoning) {
        const trimmed = decision.reasoning.trim();
        if (trimmed.length) {
            responseText = `🧠 ${trimmed}\n\n${responseText}`;
        }
    }
    
    if (userAskedGuardPlan && !/guard plan/i.test(responseText)) {
        const guardSummary =
            initialProgress.suggestions && initialProgress.suggestions.length
                ? initialProgress.suggestions.join("; ")
                : "Need to run CTA coverage and backend verification";
        responseText = `Guard plan status: still pending until we finish ${guardSummary}.\n\n${responseText}`;
    }

if (userFrustrated && !/sorry|apolog/i.test(responseText)) {
    responseText = `Sorry it feels off. Let's fix it together.\n\n${responseText}`;
}

if (userAskedPlanSummary && !/title:/i.test(responseText)) {
    const percent = `${progress.percentComplete}%`;
    const features = Array.isArray(updatedPlan.features) && updatedPlan.features.length
        ? updatedPlan.features.map((feat: string) => `  - ${feat}`).join("\n")
        : "  - TBD";
    responseText += `\n\n**Plan Markdown**\n- **Title:** ${updatedPlan.title || "Untitled"}\n- **Status:** ${updatedPlan.status || (updatedPlan.ai_score >= 80 ? "review" : "draft")} (${percent})\n- **Features:**\n${features}`;
}

    const userAskedForMockup = /mockup|html/i.test(userMessage);
    const responseMentionsMockup = /mockup|html/i.test(responseText);
    if (userAskedForMockup && !responseMentionsMockup) {
        const mockupAction = decision.action === 'generate_mockup' || decision.action === 'update_mockup';
        responseText += mockupAction
            ? "\n\n🎨 I'll keep you posted while I spin up the mockup."
            : "\n\nI'll spell out the mockup plan before we build it.";
    }
    
    return {
        summary: responseText + (mockupGenerated ? `\n\n🎨 Mockup v${updatedPlan.current_version} is live.` : ""),
        suggested_actions: progress.suggestions[0] || "Next step?",
        mockup_generated: mockupGenerated,
        current_version: updatedPlan.current_version,
        updated_plan_fields: {
            title: updatedPlan.title,
            ai_score: updatedPlan.ai_score,
            ai_next_step: updatedPlan.ai_next_step,
            ai_status_report: updatedPlan.ai_status_report,
            status: updatedPlan.ai_score >= 80 ? "review" : "draft"
        }
    };
  }
}

function extractHtmlBlocks(content: string): string[] {
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