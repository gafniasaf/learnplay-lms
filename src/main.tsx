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
    // NOTE:
    // In hosted preview environments, it's common to hit a "stale index.html" where the entry script
    // references an older hashed chunk (e.g. App-<hash>.js) that no longer exists after a redeploy.
    // Retrying won't help if the chunk is gone; the correct recovery is a guarded full reload to
    // fetch the latest HTML + asset hashes. We do this at most once to avoid reload loops.
    const reloadAttemptParam = "__iz_boot_reload_attempt";
    const tsParam = "__iz_boot_reload_ts";

    const url = new URL(window.location.href);
    const params = url.searchParams;

    const paramAttemptRaw = params.get(reloadAttemptParam);
    let attempts = Number(paramAttemptRaw ?? 0);
    if (!Number.isFinite(attempts) || attempts < 0) attempts = 0;

    const storageKey = "__iz_boot_reload_attempt";
    try {
      const storedRaw = window.sessionStorage.getItem(storageKey);
      const storedN = Number(storedRaw ?? 0);
      if (Number.isFinite(storedN) && storedN > attempts) attempts = storedN;
    } catch {
      // ignore (iframe/preview environments may block storage)
    }

    try {
      const { default: App } = await import("./App.tsx");

      // Clear any reload markers for a clean URL once the app is successfully loaded.
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
      const hadMarkers = params.has(reloadAttemptParam) || params.has(tsParam);
      if (hadMarkers) {
        params.delete(reloadAttemptParam);
        params.delete(tsParam);
        const cleanQs = params.toString();
        const cleanUrl = `${url.pathname}${cleanQs ? `?${cleanQs}` : ""}${url.hash}`;
        window.history.replaceState({}, "", cleanUrl);
      }

      createRoot(rootElement).render(<App />);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isLikelyChunkError =
        msg.includes("Failed to fetch dynamically imported module") ||
        msg.includes("Loading chunk") ||
        msg.includes("ChunkLoadError");

      // Reload once (cache-busted) to recover from stale hashed chunks.
      if (isLikelyChunkError && attempts < 1) {
        const next = attempts + 1;
        try {
          window.sessionStorage.setItem(storageKey, String(next));
        } catch {
          // ignore
        }
        params.set(reloadAttemptParam, String(next));
        params.set(tsParam, String(Date.now()));
        const nextQs = params.toString();
        const nextUrl = `${url.pathname}${nextQs ? `?${nextQs}` : ""}${url.hash}`;
        window.location.replace(nextUrl);
        return;
      }

      // Final failure: show error and halt.
      rootElement.innerHTML = `
        <div style="padding: 2rem; font-family: system-ui, sans-serif; background: #1a1a2e; color: #e2e8f0; min-height: 100vh;">
          <h1 style="color: #f87171;">❌ Failed to Load Application</h1>
          <pre style="background: #0f172a; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; color: #fbbf24;">${msg}</pre>
          <p style="color: #94a3b8;">
            This can happen after a preview redeploy. If a reload doesn't fix it, the preview build may be broken.
          </p>
          <button onclick="window.location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 0.25rem; cursor: pointer;">Reload Page</button>
        </div>
      `;
      throw error;
    }
  }
}

void bootstrap();
