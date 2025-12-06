/**
 * Generator Options Placeholder Contract Test
 * Enforces exactly one "[blank]" in options-mode items from generate-course
 */

import { supabase } from "@/integrations/supabase/client";

export async function runAgentGeneratorPlaceholderTest(): Promise<{ pass: boolean; details?: any }> {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    return {
      pass: false,
      details: { error: "No active session - authentication required for generate-course" },
    };
  }

  const details: any = {
    generationStatus: "not attempted",
    totalItems: 0,
    validItems: 0,
    invalidItems: 0,
    violations: [],
  };

  let allPassed = true;

  try {
    // Call generate-course with options mode
    const { data, error } = await supabase.functions.invoke('generate-course', {
      body: {
        prompt: "Create a simple Spanish vocabulary course with 5 fill-in-the-blank questions about common greetings",
        itemCount: 5,
        difficulty: "easy",
      },
    });

    if (error) {
      return {
        pass: false,
        details: {
          generationStatus: "✗ failed",
          error: error.message,
        },
      };
    }

    if (!data?.course) {
      return {
        pass: false,
        details: {
          generationStatus: "✗ failed",
          error: "No course data returned",
        },
      };
    }

    details.generationStatus = "✓ course generated";

    const course = data.course;
    const items = course.items || [];
    details.totalItems = items.length;

    // Validate each item
    const violations: Array<{ itemId: string; text: string; issue: string }> = [];

    for (const item of items) {
      if (item.type === "options" && item.text) {
        const text = item.text;
        
        // Count occurrences of "[blank]"
        const blankCount = (text.match(/\[blank\]/g) || []).length;
        
        // Check for old-style "___"
        const hasOldStyle = text.includes("___");

        if (blankCount !== 1) {
          violations.push({
            itemId: item.id || "unknown",
            text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
            issue: `Expected exactly 1 "[blank]", found ${blankCount}`,
          });
        }

        if (hasOldStyle) {
          violations.push({
            itemId: item.id || "unknown",
            text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
            issue: 'Contains old-style "___" placeholder',
          });
        }

        if (blankCount === 1 && !hasOldStyle) {
          details.validItems++;
        } else {
          details.invalidItems++;
        }
      }
    }

    // Report violations
    if (violations.length > 0) {
      allPassed = false;
      details.violations = violations.slice(0, 3); // First 3 offenders
      details.totalViolations = violations.length;
      details.summary = `✗ failed - ${violations.length} item(s) violate placeholder rules`;
    } else {
      details.summary = `✓ passed - all ${details.validItems} items have correct placeholder format`;
    }

  } catch (err) {
    return {
      pass: false,
      details: {
        generationStatus: "✗ error",
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }

  return {
    pass: allPassed,
    details,
  };
}
