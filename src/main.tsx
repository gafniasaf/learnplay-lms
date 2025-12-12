import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/generated.css";
import "./styles/learnplay.css";
import { validateEnv, isLiveMode } from "./lib/env";
import { loadRuntimeConfig } from "./lib/runtimeConfig";

// IgniteZero: Validate environment at startup
// In live mode, missing credentials will throw (fail loudly)
// In mock mode, we log a warning but continue
// Load runtime config first (Lovable-style hosts may not inject env vars)
void loadRuntimeConfig().finally(() => {
  try {
    validateEnv();
  } catch (err) {
    if (isLiveMode()) {
      // In live mode, show error overlay and halt
      const rootElement = document.getElementById("root");
      if (rootElement) {
        rootElement.innerHTML = `
          <div style="padding: 2rem; font-family: system-ui, sans-serif; background: #1a1a2e; color: #e2e8f0; min-height: 100vh;">
            <h1 style="color: #f87171;">❌ Environment Configuration Error</h1>
            <pre style="background: #0f172a; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; color: #fbbf24;">${err instanceof Error ? err.message : String(err)}</pre>
            <p style="color: #94a3b8;">Provide required env vars, or add <code>/app-config.json</code> (Lovable).</p>
          </div>
        `;
      }
      throw err; // Re-throw to halt app
    }
    // In mock mode, just log and continue
    console.warn('[Env] Validation warning (mock mode):', err);
  }
});

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(<App />);
}
