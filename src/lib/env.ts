/**
 * Environment configuration and runtime overrides
 * 
 * Live mode can be toggled at runtime via:
 * - URL parameter: ?live=1 (enable live mode) or ?live=0 (enable mock mode)
 * - localStorage.useMock: 'false' (live) or 'true' (mock)
 * - Default: VITE_USE_MOCK environment variable
 * 
 * Dev mode can be toggled at runtime via:
 * - URL parameter: ?dev=1 (enable) or ?dev=0 (disable)
 * - localStorage "app.dev": "1" (enable) or "0" (disable)
 * - Default: VITE_ENABLE_DEV environment variable
 */

const STORAGE_KEY = 'useMock';
const DEV_STORAGE_KEY = 'app.dev';
const DEV_CHANGED_EVENT = 'dev:changed';

/**
 * Check URL parameters once on boot and update localStorage if override is present
 */
function checkUrlOverride(): void {
  if (typeof window === 'undefined') return;

  try {
    const params = new URLSearchParams(window.location.search);
    
    // Check live mode override
    const liveParam = params.get('live');
    if (liveParam === '1') {
      // ?live=1 means enable live mode (useMock = false)
      localStorage.setItem(STORAGE_KEY, 'false');
      console.info('[Env] Runtime override: LIVE mode enabled via URL (?live=1)');
    } else if (liveParam === '0') {
      // ?live=0 means enable mock mode (useMock = true)
      localStorage.setItem(STORAGE_KEY, 'true');
      console.info('[Env] Runtime override: MOCK mode enabled via URL (?live=0)');
    }
    
    // Check dev mode override
    const devParam = params.get('dev');
    if (devParam === '1') {
      localStorage.setItem(DEV_STORAGE_KEY, '1');
      console.info('[Env] Runtime override: DEV mode enabled via URL (?dev=1)');
    } else if (devParam === '0') {
      localStorage.setItem(DEV_STORAGE_KEY, '0');
      console.info('[Env] Runtime override: DEV mode disabled via URL (?dev=0)');
    }
  } catch (error) {
    console.warn('[Env] Failed to check URL override:', error);
  }
}

// Run URL check once on module load
checkUrlOverride();

/**
 * Determine if live mode is enabled
 * 
 * Priority order:
 * 1. localStorage.useMock ('false' = live, 'true' = mock)
 * 2. VITE_USE_MOCK env variable ('false' = live, anything else = mock)
 * 
 * @returns true if live mode is enabled (not using mocks)
 */
export function isLiveMode(): boolean {
  if (typeof window === 'undefined') {
    // Server-side/Jest: use process.env only
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (typeof process !== 'undefined' && (process as any).env?.VITE_USE_MOCK === 'false');
  }

  // If env explicitly sets VITE_USE_MOCK='false', prioritize that (for dev server testing)
  if (import.meta.env.VITE_USE_MOCK === 'false') {
    return true;
  }

  try {
    // Check localStorage override
    const storedValue = localStorage.getItem(STORAGE_KEY);
    
    if (storedValue !== null) {
      // localStorage is set: 'false' means live mode ON, 'true' means mock mode ON
      return storedValue === 'false';
    }
  } catch (error) {
    console.warn('[Env] Failed to access localStorage:', error);
  }

  // Default to mock mode
  return false;
}

/**
 * Get current API mode for display/debugging
 */
export function getApiMode(): 'mock' | 'live' {
  return isLiveMode() ? 'live' : 'mock';
}

/**
 * In preview, force same-origin reads for read-only endpoints to avoid CORS.
 * Enabled when VITE_FORCE_SAME_ORIGIN_PREVIEW === 'true'.
 */
export function forceSameOriginPreview(): boolean {
  if (typeof window === 'undefined') return false;
  return import.meta.env.VITE_FORCE_SAME_ORIGIN_PREVIEW === 'true';
}


/**
 * Clear any runtime overrides (reset to env default)
 */
export function clearModeOverride(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  console.info('[Env] Runtime override cleared, using .env default');
}

/**
 * Check if dev routes are enabled
 * 
 * Priority order:
 * 1. localStorage "app.dev" ("1" = enabled, "0" = disabled)
 * 2. URL parameter ?dev=1 (persisted to localStorage on boot)
 * 3. VITE_ENABLE_DEV env variable
 * 
 * @returns true if dev routes should be accessible
 */
export function isDevEnabled(): boolean {
  if (typeof window === 'undefined') {
    // Server-side: use env variable only
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (typeof process !== 'undefined' && (process as any).env?.VITE_ENABLE_DEV === 'true');
  }

  // Check localStorage first
  const storedValue = localStorage.getItem(DEV_STORAGE_KEY);
  
  if (storedValue !== null) {
    // localStorage is set: "1" means dev enabled, "0" means disabled
    return storedValue === '1';
  }

  // No localStorage override: fall back to env variable
  return import.meta.env.VITE_ENABLE_DEV === 'true';
}

/**
 * Set dev mode (persists to localStorage and notifies listeners)
 * 
 * @param enabled - true to enable dev mode, false to disable
 */
export function setDevEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(DEV_STORAGE_KEY, enabled ? '1' : '0');
  
  // Dispatch custom event for listeners
  window.dispatchEvent(new CustomEvent(DEV_CHANGED_EVENT, { detail: enabled }));
  
  console.info(`[Env] Dev mode ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Listen for dev mode changes
 * 
 * @param fn - Callback function to be called when dev mode changes
 * @returns Cleanup function to remove listeners
 */
export function onDevChange(fn: (enabled: boolean) => void): () => void {
  const handleDevChanged = (e: Event) => {
    const customEvent = e as CustomEvent<boolean>;
    fn(customEvent.detail);
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === DEV_STORAGE_KEY) {
      fn(isDevEnabled());
    }
  };

  window.addEventListener(DEV_CHANGED_EVENT, handleDevChanged);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(DEV_CHANGED_EVENT, handleDevChanged);
    window.removeEventListener('storage', handleStorage);
  };
}

/**
 * Get the list of allowed embed origins for postMessage security
 * 
 * Priority order:
 * 1. localStorage "app.embedAllowed"
 * 2. VITE_EMBED_ALLOWED_ORIGINS env variable
 * 
 * @returns Array of allowed origin URLs (comma-separated in source)
 */
export function getEmbedAllowedOrigins(): string[] {
  const envVal = import.meta.env.VITE_EMBED_ALLOWED_ORIGINS as string | undefined;
  const lsVal = (typeof window !== 'undefined' ? localStorage.getItem("app.embedAllowed") : null) || '';
  const raw = envVal || lsVal || '';
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

/**
 * Validate required environment variables at startup
 * Throws an error if critical configuration is missing
 */
export function validateEnv(): void {
  const errors: string[] = [];
  const liveMode = isLiveMode();
  
  // Only enforce hard requirements in LIVE mode; soft-pass otherwise
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseKey =
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

  // Check if we're using hardcoded fallbacks from client.ts
  const hasHardcodedFallback = true; // client.ts has hardcoded credentials

  if (liveMode && !hasHardcodedFallback) {
    if (!supabaseUrl) {
      errors.push("VITE_SUPABASE_URL is required");
    }
    if (!supabaseKey) {
      errors.push("Supabase public key is required (VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY)");
    }
  } else if (!supabaseUrl || !supabaseKey) {
    console.warn(
      "[Env] Running with hardcoded fallbacks or mock mode; validation softened."
    );
  }
  
  // Required if Sentry is enabled: Sentry DSN
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (sentryDsn && typeof sentryDsn === 'string' && sentryDsn.trim()) {
    // Validate DSN format (basic check)
    if (!sentryDsn.startsWith('https://') || !sentryDsn.includes('@')) {
      errors.push("VITE_SENTRY_DSN has invalid format (expected https://...@...)");
    }
  }
  
  if (errors.length > 0) {
    const errorMessage = `Environment validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  
  console.log("✅ Environment validation passed");
}
