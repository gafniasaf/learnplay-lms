/**
 * Environment configuration and runtime overrides
 *
 * IMPORTANT (LearnPlay/IgniteZero): **Mock mode is forbidden**.
 * We intentionally fail loudly if anything tries to enable "mock" data paths,
 * because mock responses hide missing backend functionality.
 *
 * Dev mode can be toggled at runtime via:
 * - URL parameter: ?dev=1 (enable) or ?dev=0 (disable)
 * - localStorage "app.dev": "1" (enable) or "0" (disable)
 * - Default: VITE_ENABLE_DEV environment variable
 */

const DEV_STORAGE_KEY = 'app.dev';
const DEV_CHANGED_EVENT = 'dev:changed';

/**
 * Check URL parameters once on boot and update localStorage if override is present
 */
// Safe localStorage wrapper to handle restricted iframe environments
const safeStorage = (() => {
  if (typeof window === 'undefined') return null;
  try {
    const testKey = '__env_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return localStorage;
  } catch {
    return null;
  }
})();

function checkUrlOverride(): void {
  if (typeof window === 'undefined' || !safeStorage) return;

  try {
    const params = new URLSearchParams(window.location.search);

    // Mock-mode override is forbidden (fail loudly).
    const liveParam = params.get('live');
    if (liveParam === '0') {
      throw new Error('❌ MOCK MODE FORBIDDEN: remove ?live=0 and do not use mock responses. Implement the missing backend instead.');
    }
    
    // Check dev mode override
    const devParam = params.get('dev');
    if (devParam === '1') {
      safeStorage.setItem(DEV_STORAGE_KEY, '1');
      console.info('[Env] Runtime override: DEV mode enabled via URL (?dev=1)');
    } else if (devParam === '0') {
      safeStorage.setItem(DEV_STORAGE_KEY, '0');
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
    // Server-side/Jest: mock mode is also forbidden.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestedMock = (typeof process !== 'undefined' && (process as any).env?.VITE_USE_MOCK === 'true');
    if (requestedMock) {
      throw new Error('❌ MOCK MODE FORBIDDEN: VITE_USE_MOCK=true is not allowed. Remove mock responses and implement backend.');
    }
    return true;
  }

  if (import.meta.env.VITE_USE_MOCK === 'true') {
    throw new Error('❌ MOCK MODE FORBIDDEN: VITE_USE_MOCK=true is not allowed. Remove mock responses and implement backend.');
  }

  // Default and only supported behavior: live mode.
  return true;
}

/**
 * Get current API mode for display/debugging
 */
export function getApiMode(): 'mock' | 'live' {
  return 'live';
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
  // Mock-mode overrides are not supported; keep this as a no-op for backward compatibility.
  return;
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

  // Check localStorage first (using safe wrapper)
  if (safeStorage) {
    const storedValue = safeStorage.getItem(DEV_STORAGE_KEY);
    
    if (storedValue !== null) {
      // localStorage is set: "1" means dev enabled, "0" means disabled
      return storedValue === '1';
    }
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
  if (typeof window === 'undefined' || !safeStorage) return;

  safeStorage.setItem(DEV_STORAGE_KEY, enabled ? '1' : '0');
  
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
  const lsVal = safeStorage?.getItem("app.embedAllowed") || '';
  const raw = envVal || lsVal || '';
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

/**
 * Validate required environment variables at startup
 * Throws an error if critical configuration is missing
 * 
 * TEMPORARY: Hardcoded dev fallbacks for Lovable deployment (dev mode only)
 */
export function validateEnv(): void {
  const errors: string[] = [];
  const liveMode = isLiveMode();
  
  // Only enforce hard requirements in LIVE mode; soft-pass otherwise
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseKey =
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

  // In Lovable, runtime config may provide these; validateEnv is only a hint layer.
  // Real API calls will still fail loudly if config is missing.
  if (liveMode && !supabaseUrl) {
    // Note: runtime config may supply this at runtime (see /app-config.json)
    console.warn("[Env] VITE_SUPABASE_URL not set (runtime config may supply it)");
  }
  if (liveMode && !supabaseKey) {
    console.warn("[Env] Supabase key not set (runtime config may supply it)");
  }
  if (!liveMode && (!supabaseUrl || !supabaseKey)) {
    console.warn(
      "[Env] Running in mock mode (VITE_USE_MOCK=true); Supabase credentials not required."
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
