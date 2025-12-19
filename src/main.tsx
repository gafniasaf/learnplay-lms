import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/generated.css";
import "./styles/learnplay.css";
import { validateEnv } from "./lib/env";
import { loadRuntimeConfig } from "./lib/runtimeConfig";

async function bootstrap() {
  // Load runtime config first (Lovable-style hosts may not inject env vars).
  // IMPORTANT: we must await this before rendering, otherwise modules that rely on runtime config
  // (e.g. Supabase client bootstrapping) may throw at first use.
  await loadRuntimeConfig();

  try {
    validateEnv();
  } catch (err) {
    // Always show error overlay and halt (IgniteZero is live-only).
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
    throw err;
  }

  const rootElement = document.getElementById("root");
  if (rootElement) {
    // Import App AFTER runtime config is loaded so any module-scope config reads
    // (e.g. Supabase client init) can see /app-config.json in preview environments.
    // NOTE: Dynamic imports can fail in Lovable preview environments. Add retry logic.
    let App;
    let retries = 3;
    while (retries > 0) {
      try {
        const module = await import("./App.tsx");
        App = module.default;
        break;
      } catch (error) {
        retries--;
        if (retries === 0) {
          // Final failure: show error and halt
          rootElement.innerHTML = `
            <div style="padding: 2rem; font-family: system-ui, sans-serif; background: #1a1a2e; color: #e2e8f0; min-height: 100vh;">
              <h1 style="color: #f87171;">❌ Failed to Load Application</h1>
              <pre style="background: #0f172a; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; color: #fbbf24;">${error instanceof Error ? error.message : String(error)}</pre>
              <p style="color: #94a3b8;">This can happen in preview environments. Try refreshing the page.</p>
              <button onclick="window.location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 0.25rem; cursor: pointer;">Reload Page</button>
            </div>
          `;
          throw error;
        }
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    if (App) {
      createRoot(rootElement).render(<App />);
    }
  }
}

void bootstrap();
