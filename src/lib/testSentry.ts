/**
 * Test utility to manually trigger Sentry error
 * Usage: import and call testSentryError() to verify Sentry is working
 */

export function testSentryError() {
  console.log("🧪 Triggering test error for Sentry...");
  
  // Create a test error with context
  const testError = new Error("Test error for Sentry verification - this is expected");
  testError.name = "SentryTestError";
  
  // Add some context
  (testError as any).testContext = {
    timestamp: new Date().toISOString(),
    purpose: "Sentry integration test",
    route: window.location.pathname,
  };
  
  // Throw the error (will be caught by Sentry)
  throw testError;
}

export function testSentryManualCapture() {
  console.log("🧪 Manually capturing test error in Sentry...");
  
  if (typeof window !== 'undefined' && (window as any).Sentry) {
    const Sentry = (window as any).Sentry;
    
    Sentry.captureMessage("Manual Sentry test from testSentry.ts", {
      level: "info",
      tags: {
        test: "manual",
        route: window.location.pathname,
      },
      extra: {
        timestamp: new Date().toISOString(),
        purpose: "Testing Sentry integration",
      },
    });
    
    console.log("✅ Test message sent to Sentry");
  } else {
    console.warn("⚠️ Sentry not initialized - check VITE_SENTRY_DSN");
  }
}
