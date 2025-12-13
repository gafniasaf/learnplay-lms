import { getRuntimeConfigSync } from "@/lib/runtimeConfig";

export type ApiMode = "edge" | "mcp";

let loggedDefault = false;

/**
 * API transport mode (NOT mock/live).
 *
 * Priority:
 * 1) `public/app-config.json` → `apiMode` (Lovable/preview safe)
 * 2) `VITE_API_MODE` (local/dev)
 * 3) legacy: `VITE_USE_MCP_PROXY=true|1` → "mcp"
 * 4) default: "edge" (safe for deployed environments)
 */
export function getApiMode(): ApiMode {
  const cfg = getRuntimeConfigSync();
  if (cfg.apiMode === "edge" || cfg.apiMode === "mcp") return cfg.apiMode;

  const envMode = import.meta.env.VITE_API_MODE as string | undefined;
  if (envMode === "edge" || envMode === "mcp") return envMode;

  const legacyUseProxy =
    import.meta.env.VITE_USE_MCP_PROXY === "true" || import.meta.env.VITE_USE_MCP_PROXY === "1";
  if (legacyUseProxy) return "mcp";

  if (!loggedDefault) {
    loggedDefault = true;
    console.info('[ApiMode] apiMode not configured; defaulting to "edge"');
  }
  return "edge";
}


