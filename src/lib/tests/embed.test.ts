/**
 * Embed mode tests
 */

import { isEmbed, postToHost } from "@/lib/embed";

export async function runEmbedTests(): Promise<{ pass: boolean; details?: any }> {
  const results: Record<string, boolean> = {};
  const details: any = {
    tests: {},
    embedMode: false,
    embedParam: false,
    messagesSent: 0,
    capturedMessages: [],
  };
  
  try {
    // Test 1: Detect embed via URL
    const url = new URL(window.location.href);
    const hasEmbedParam = url.searchParams.get("embed") === "1";
    const embedDetected = isEmbed();
    results["detects-embed-via-url"] = hasEmbedParam ? embedDetected : true;
    
    details.embedMode = embedDetected;
    details.embedParam = hasEmbedParam;
    
    // Test 2: Post ready/resize events without throwing
    // Only test if we're in embed mode
    if (hasEmbedParam && embedDetected) {
      const capturedMessages: any[] = [];
      const originalParent = window.parent;
      
      try {
        // Mock window.parent.postMessage
        const mockParent = {
          ...originalParent,
          postMessage: (message: any, targetOrigin: string) => {
            capturedMessages.push({ message, targetOrigin });
          },
        };
        
        // Replace window.parent temporarily
        Object.defineProperty(window, 'parent', {
          configurable: true,
          writable: true,
          value: mockParent,
        });
        
        // Post events
        postToHost({ type: "ready", payload: { version: "test" } });
        postToHost({ type: "resize", payload: { height: 600 } });
        
        details.messagesSent = capturedMessages.length;
        details.capturedMessages = capturedMessages.map(m => m.message);
        
        // Verify messages were sent
        results["posts-ready-event"] = capturedMessages.length >= 2;
        results["ready-message-format"] = capturedMessages.some(
          m => m.message?.type === "ready" && m.message?.payload?.version === "test"
        );
        results["resize-message-format"] = capturedMessages.some(
          m => m.message?.type === "resize" && m.message?.payload?.height === 600
        );
        
      } catch (error) {
        results["posts-ready-event"] = false;
        details.error = error instanceof Error ? error.message : String(error);
      } finally {
        // Restore original parent
        Object.defineProperty(window, 'parent', {
          configurable: true,
          writable: true,
          value: originalParent,
        });
      }
    } else {
      // Not in embed mode, just verify postToHost doesn't throw
      try {
        postToHost({ type: "ready", payload: { version: "test" } });
        postToHost({ type: "resize", payload: { height: 600 } });
        results["posts-ready-event"] = true; // smoke test: didn't throw
      } catch (error) {
        results["posts-ready-event"] = false;
        details.error = error instanceof Error ? error.message : String(error);
      }
    }
    
    details.tests = results;
    const allPassed = Object.values(results).every(Boolean);
    
    return {
      pass: allPassed,
      details,
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        ...details,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

