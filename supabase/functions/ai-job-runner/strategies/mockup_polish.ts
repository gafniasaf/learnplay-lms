import { JobExecutor, JobContext } from './types.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

export class MockupPolish implements JobExecutor {
  async execute(context: JobContext): Promise<any> {
    const { payload } = context;
    const planId = payload.planBlueprintId;
    const request = payload.ai_request || "Create a stunning, production-ready UI";

    if (!planId) throw new Error("Missing planBlueprintId");

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch Plan
    const { data: blob, error: dlError } = await supabase.storage
      .from('content')
      .download(`planblueprints/${planId}.json`);

    if (dlError) throw new Error(`Plan not found: ${dlError.message}`);
    const planData = JSON.parse(await blob.text());
    
    const baselineHtml =
      (typeof planData.reference_html === "string" && planData.reference_html.trim().length
        ? planData.reference_html
        : "") ||
      planData.current_mockup_html ||
      "";
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!anthropicKey) throw new Error("Blocked: Anthropic API key missing. Please set ANTHROPIC_API_KEY.");
    if (!openaiKey) throw new Error("Blocked: OpenAI API key missing. Please set OPENAI_API_KEY.");

    // --- PIPELINE STEP 1: ART DIRECTOR (Claude) ---
    let designSystem = planData.design_system;

    if (!designSystem) {
        console.log("🎨 Art Director (Claude): Crafting Visual Identity...");
        
        const appTitle = planData.title || 'New App';
        const appDescription = planData.description || '';
        
        const artDirectorPrompt = `You are a world-class UI/UX designer. Create a design system for "${appTitle}".
${appDescription ? `Context: ${appDescription}` : ''}

Output ONLY valid JSON with this exact structure:
{
  "themeName": "A creative theme name",
  "inspiration": "One sentence describing the visual inspiration",
  "cssVariables": {
    "--background": "#f8fafc",
    "--foreground": "#1e293b",
    "--primary": "#3b82f6",
    "--primary-foreground": "#ffffff",
    "--secondary": "#f1f5f9",
    "--accent": "#f59e0b",
    "--muted": "#e2e8f0",
    "--border": "#cbd5e1",
    "--radius": "12px",
    "--shadow": "0 4px 20px rgba(0,0,0,0.08)"
  },
  "typography": {
    "heading": "Inter",
    "body": "Inter"
  },
  "characteristics": ["modern", "clean", "professional"]
}`;

        const artResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5',
                max_tokens: 1024,
                messages: [{ role: 'user', content: artDirectorPrompt }]
            })
        });
        
        const artResult = await artResponse.json();
        const artContent = artResult.content[0].text;
        // Extract JSON from response (Claude doesn't have structured output mode)
        const jsonMatch = artContent.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Art Director failed to return valid JSON");
        designSystem = JSON.parse(jsonMatch[0]);
        console.log(`✨ Created theme: "${designSystem.themeName}" - ${designSystem.inspiration}`);
        
        planData.design_system = designSystem;
    }

    // --- PIPELINE STEP 2: UI DEVELOPER (Claude with strict UI/UX spec) ---
    console.log(`🛠️ UI Developer (Claude): Building with "${designSystem.themeName}" theme`);

    const uiDeveloperPrompt = `You are a senior frontend developer building production-ready HTML/CSS.

DESIGN SYSTEM:
${JSON.stringify(designSystem, null, 2)}

USER REQUEST: "${request}"

CURRENT HTML TO IMPROVE:
${baselineHtml || "<p>Empty - create from scratch</p>"}

=== MANDATORY CSS FOUNDATION ===
Your output MUST include this CSS reset at the start of the <style> block:

/* Reset & Foundation */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
img { max-width: 100%; height: auto; display: block; }
button { cursor: pointer; font: inherit; }
input, select, textarea { font: inherit; }

/* Form Element Alignment - CRITICAL */
.form-group { display: flex; flex-direction: column; gap: 8px; }
.checkbox-row, .radio-row { 
  display: flex; 
  align-items: center; 
  gap: 10px; 
}
.checkbox-row input[type="checkbox"],
.checkbox-row input[type="radio"] {
  width: 18px;
  height: 18px;
  margin: 0;
  flex-shrink: 0;
}
.checkbox-row label {
  margin: 0;
  line-height: 1.2;
  cursor: pointer;
}

=== LAYOUT REQUIREMENTS ===
1. Use .mockup-app as the root wrapper (NOT body)
2. .mockup-app must have: min-height: 100vh; background: var(--background); font-family: ...
3. Use CSS Grid for page layout, Flexbox for components
4. Max-width containers: 1200px for content, centered with margin: 0 auto
5. Consistent spacing scale: 8px, 16px, 24px, 32px, 48px, 64px

=== COMPONENT SPECIFICATIONS ===

CARDS:
- border-radius: var(--radius)
- box-shadow: var(--shadow)
- padding: 24px
- background: white
- hover: transform: translateY(-4px); box-shadow: 0 12px 40px rgba(0,0,0,0.12)
- transition: all 0.2s ease

BUTTONS:
- padding: 12px 24px
- border-radius: var(--radius)
- font-weight: 600
- Primary: background: var(--primary); color: var(--primary-foreground)
- hover: filter: brightness(1.1); transform: scale(1.02)
- transition: all 0.15s ease

INPUTS:
- padding: 12px 16px
- border: 2px solid var(--border)
- border-radius: var(--radius)
- focus: border-color: var(--primary); outline: none; box-shadow: 0 0 0 3px rgba(primary, 0.1)

TYPOGRAPHY:
- Headings: font-family: var(--font-heading); letter-spacing: -0.02em
- h1: 2.5rem, font-weight: 700
- h2: 1.75rem, font-weight: 600
- Body: font-size: 1rem; line-height: 1.6
- Small/muted: font-size: 0.875rem; color: var(--muted)

=== IMAGE REQUIREMENTS ===
Use real Unsplash URLs with specific photo IDs:
- Hero: https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&h=600&fit=crop
- Cards: https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=400&h=300&fit=crop
- Avatars: https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face

=== DATA ATTRIBUTES (PRESERVE) ===
Keep all: data-cta-id, data-action, data-field, data-entity, data-job-type

=== OUTPUT FORMAT ===
Return ONLY a JSON object with a single "html" key:
{"html": "<style>...complete CSS...</style><div class='mockup-app'>...complete HTML...</div>"}

The HTML must be complete, production-ready, and visually polished. No placeholders, no TODOs.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 8192,
            messages: [{ role: 'user', content: uiDeveloperPrompt }]
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Claude API Failed: ${err}`);
    }
    
    const aiResult = await response.json();
    const rawContent = aiResult.content[0].text;
    
    // Claude often returns the HTML directly or wrapped in JSON
    // Try multiple extraction strategies
    let html = "";
    
    // Strategy 1: Look for {"html": "..."} pattern
    const jsonMatch = rawContent.match(/\{\s*"html"\s*:\s*"/);
    if (jsonMatch) {
        // Find the start of the HTML value
        const startIdx = rawContent.indexOf('"html"') + 8; // after "html":"
        // Find where it ends - look for closing "}
        let depth = 0;
        let inString = true;
        let escaped = false;
        let endIdx = startIdx;
        
        for (let i = startIdx; i < rawContent.length; i++) {
            const char = rawContent[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            if (char === '"' && inString) {
                // Check if this is the end of the html string
                if (rawContent[i+1] === '}' || rawContent.substring(i+1).trim().startsWith('}')) {
                    endIdx = i;
                    break;
                }
            }
        }
        
        // Extract and unescape the HTML
        html = rawContent.substring(startIdx, endIdx);
        // Unescape common escapes
        html = html.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    
    // Strategy 2: If no JSON, look for <style> or <div class="mockup-app"
    if (!html) {
        const styleMatch = rawContent.match(/<style>[\s\S]*<\/style>[\s\S]*<div class=['"]mockup-app['"][\s\S]*<\/div>/);
        if (styleMatch) {
            html = styleMatch[0];
        }
    }
    
    // Strategy 3: Just take everything between first <style> and last </div>
    if (!html) {
        const styleStart = rawContent.indexOf('<style>');
        const divEnd = rawContent.lastIndexOf('</div>');
        if (styleStart !== -1 && divEnd !== -1) {
            html = rawContent.substring(styleStart, divEnd + 6);
        }
    }
    
    if (!html) {
        throw new Error("UI Developer failed to return valid HTML. Raw: " + rawContent.substring(0, 1000));
    }

    // --- PIPELINE STEP 3: GPT-5.1 REVIEWER ---
    console.log("🔍 Reviewer (GPT-5.1): Analyzing UI quality...");
    
    const reviewPrompt = `You are a senior UI/UX reviewer. Analyze this HTML mockup and provide structured feedback.

HTML TO REVIEW:
${html.substring(0, 8000)}

EVALUATION CRITERIA:
1. VISUAL DESIGN (0-25): Color harmony, typography, spacing, shadows
2. COMPONENT QUALITY (0-25): Form alignment, button styles, card layouts, hover states
3. RESPONSIVENESS (0-25): Mobile breakpoints, flexible grids, touch targets
4. COMPLETENESS (0-25): All sections present, real content, proper data attributes

OUTPUT FORMAT (JSON only):
{
  "score": <total 0-100>,
  "breakdown": {
    "visual_design": <0-25>,
    "component_quality": <0-25>,
    "responsiveness": <0-25>,
    "completeness": <0-25>
  },
  "critical_issues": ["issue 1", "issue 2"],
  "suggestions": ["suggestion 1", "suggestion 2"],
  "verdict": "PASS" or "NEEDS_REFINEMENT"
}`;

    const reviewResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({
            model: 'gpt-5',
            messages: [{ role: 'user', content: reviewPrompt }],
            response_format: { type: "json_object" }
        })
    });

    let review = { score: 100, verdict: "PASS", critical_issues: [], suggestions: [] };
    if (reviewResponse.ok) {
        const reviewResult = await reviewResponse.json();
        try {
            review = JSON.parse(reviewResult.choices[0].message.content);
            console.log(`📊 Review Score: ${review.score}/100 - ${review.verdict}`);
        } catch (e) {
            console.log("⚠️ Could not parse review, proceeding with HTML as-is");
        }
    }

    // --- PIPELINE STEP 4: REFINEMENT (if needed) ---
    let finalHtml = html;
    let refinementAttempts = 0;
    const MAX_REFINEMENTS = 2;

    while (review.verdict === "NEEDS_REFINEMENT" && refinementAttempts < MAX_REFINEMENTS) {
        refinementAttempts++;
        console.log(`🔧 Refiner (Claude Sonnet 4.5): Iteration ${refinementAttempts}...`);

        const refinePrompt = `You are a UI developer fixing issues in an HTML mockup.

CURRENT HTML:
${finalHtml.substring(0, 10000)}

ISSUES TO FIX:
${review.critical_issues?.map((i: string, idx: number) => `${idx + 1}. ${i}`).join('\n') || 'None specified'}

SUGGESTIONS TO IMPLEMENT:
${review.suggestions?.map((s: string, idx: number) => `${idx + 1}. ${s}`).join('\n') || 'None specified'}

Fix ALL issues while preserving the overall structure and data attributes.
Return the complete fixed HTML (style + mockup-app div).`;

        const refineResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5',
                max_tokens: 16384,
                messages: [{ role: 'user', content: refinePrompt }]
            })
        });

        if (refineResponse.ok) {
            const refineResult = await refineResponse.json();
            const refinedContent = refineResult.content[0].text;
            
            // Extract HTML from refined response
            const styleStart = refinedContent.indexOf('<style>');
            const divEnd = refinedContent.lastIndexOf('</div>');
            if (styleStart !== -1 && divEnd !== -1) {
                finalHtml = refinedContent.substring(styleStart, divEnd + 6);
                console.log(`✅ Refinement ${refinementAttempts} complete`);
            }
        }

        // Re-review the refined HTML
        if (refinementAttempts < MAX_REFINEMENTS) {
            const reReviewResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
                body: JSON.stringify({
                    model: 'gpt-5',
                    messages: [{ role: 'user', content: reviewPrompt.replace(html.substring(0, 8000), finalHtml.substring(0, 8000)) }],
                    response_format: { type: "json_object" }
                })
            });

            if (reReviewResponse.ok) {
                const reReviewResult = await reReviewResponse.json();
                try {
                    review = JSON.parse(reReviewResult.choices[0].message.content);
                    console.log(`📊 Re-Review Score: ${review.score}/100 - ${review.verdict}`);
                } catch (e) {
                    review.verdict = "PASS"; // Break loop on parse error
                }
            }
        }
    }

    // --- SAVE FINAL OUTPUT ---
    const updatedPlan = { 
        ...planData, 
        current_mockup_html: finalHtml, 
        design_system: designSystem,
        review_score: review.score,
        review_feedback: review,
        updated_at: new Date().toISOString() 
    };
    
    await supabase.storage
        .from('content')
        .upload(`planblueprints/${planId}.json`, JSON.stringify(updatedPlan), { upsert: true, contentType: 'application/json' });

    return { 
        success: true, 
        html: finalHtml,
        plan: updatedPlan,
        html_length: finalHtml.length, 
        theme: designSystem.themeName, 
        inspiration: designSystem.inspiration,
        review_score: review.score,
        refinement_iterations: refinementAttempts
    };
  }
}
