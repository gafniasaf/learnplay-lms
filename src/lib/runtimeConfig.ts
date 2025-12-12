export type RuntimeConfig = {
  supabase?: {
    url?: string;
    publishableKey?: string;
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


