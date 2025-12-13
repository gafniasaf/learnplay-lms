export type RuntimeConfig = {
  /**
   * Controls how the frontend talks to backend APIs in deployed environments.
   * - "edge": call Supabase Edge Functions directly (recommended for Lovable preview)
   * - "mcp": use MCP JSON-RPC proxy (local development only; requires env vars)
   */
  apiMode?: "edge" | "mcp";
  supabase?: {
    url?: string;
    publishableKey?: string;
  };
  /**
   * Optional: enable dev-agent auth mode via runtime config (e.g. Lovable).
   * Note: credentials MUST still come from environment variables; never store tokens in app-config.json.
   */
  devAgent?: {
    enabled?: boolean;
  };
};

let cached: RuntimeConfig | null = null;

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (cached) return cached;
  if (typeof window === "undefined") {
    cached = {};
    return cached;
  }

  try {
    const res = await fetch("/app-config.json", { cache: "no-store" });
    if (!res.ok) {
      cached = {};
      return cached;
    }
    const json = (await res.json()) as RuntimeConfig;
    cached = json ?? {};
    return cached;
  } catch {
    cached = {};
    return cached;
  }
}

export function getRuntimeConfigSync(): RuntimeConfig {
  return cached ?? {};
}


