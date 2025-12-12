import { isLiveMode } from "../env";

// IgniteZero: NO hardcoded fallbacks - environment variables are REQUIRED
// Configure in .env:
//   VITE_SUPABASE_URL=https://your-project.supabase.co
//   VITE_SUPABASE_ANON_KEY=your-anon-key

// -------------------------
// DEV OPEN UI BYPASS
// -------------------------
// DEV_OPEN_UI is an explicit override for preview-only environments.
// IMPORTANT: This must be OFF for end-client (production) builds.
const DEV_OPEN_UI = import.meta.env.VITE_DEV_OPEN_UI === "true";
const DEV_SUPABASE_URL_FALLBACK = "https://eidcegehaswbtzrwzvfa.supabase.co";
const DEV_SUPABASE_ANON_KEY_FALLBACK =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZGNlZ2VoYXN3YnR6cnd6dmZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NDYzNTAsImV4cCI6MjA4MDQyMjM1MH0.DpXOHjccnVEewnPF5gA6tw27TcRXkkAfgrJkn0NvT_Q";
const DEV_AGENT_TOKEN_FALLBACK = "learnplay-agent-token";
const DEV_ORG_ID_FALLBACK = "4d7b0a5c-3cf1-49e5-9ad7-bf6c1f8a2f58";
// Seeded IDs (present in repo, used in existing parent APIs)
const DEV_CHILD_ID_FALLBACK = "b2ed7195-4202-405b-85e4-608944a27837";
const DEV_PARENT_ID_FALLBACK = "613d43cb-0922-4fad-b528-dbed8d2a5c79";

export function isDevOpenUiAllowed(): boolean {
  // Explicit only (no hostname-based auto-enable). Keeps production behavior clean.
  return DEV_OPEN_UI;
}

/**
 * Get Supabase URL
 */
export function getSupabaseUrl(): string {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (url) return url;

  if (isDevOpenUiAllowed()) {
    console.warn("[DEV OPEN UI] Using hardcoded Supabase URL fallback");
    return DEV_SUPABASE_URL_FALLBACK;
  }

  throw new Error("❌ BLOCKED: VITE_SUPABASE_URL is REQUIRED");
}

/**
 * Get Supabase anon/publishable key
 */
export function getSupabaseAnonKey(): string {
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (key) return key;

  if (isDevOpenUiAllowed()) {
    console.warn("[DEV OPEN UI] Using hardcoded Supabase anon key fallback");
    return DEV_SUPABASE_ANON_KEY_FALLBACK;
  }

  throw new Error("❌ BLOCKED: VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) is REQUIRED");
}

/**
 * Custom API error class with structured error information
 */
export class ApiError extends Error {
  public readonly requestId?: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
    details?: unknown,
    requestId?: string
  ) {
    super(message);
    this.name = "ApiError";
    this.details = details;
    this.requestId = requestId;
  }
}

/**
 * Check if mock mode is enabled (non-hook helper)
 *
 * Override at runtime via:
 * - URL parameter: ?live=1 (enable live mode) or ?live=0 (enable mock mode)
 * - localStorage.useMock: 'false' (live) or 'true' (mock)
 * - Default: VITE_USE_MOCK environment variable
 *
 * @returns true if using mock data, false if using live edge functions
 */
export const shouldUseMockData = (): boolean => {
  return !isLiveMode();
};

/**
 * Backwards-compatible alias for components/hooks that already import `useMockData`.
 * This is intentionally NOT a React hook; it simply delegates to `shouldUseMockData`.
 */
export const useMockData = shouldUseMockData;

/**
 * Fetch with timeout and retry logic
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(
        "Request timeout",
        "TIMEOUT",
        408,
        { url, timeoutMs }
      );
    }
    throw error;
  }
}

/**
 * Check if we're in dev/preview mode (Lovable, localhost, etc.)
 * In dev mode, we use agent token auth instead of user session auth
 */
export function isDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  const isLovable = hostname.includes('lovable') || hostname.includes('lovableproject.com');
  const isLocalhost = hostname.includes('localhost') || hostname.includes('127.0.0.1');
  const isUrlOverride = new URLSearchParams(window.location.search).get('devMode') === '1';
  const devMode = isLovable || isLocalhost || isUrlOverride;
  
  // Log once per session for debugging
  if (typeof window !== 'undefined' && !(window as any).__devModeLogged) {
    console.log(`[isDevMode] hostname=${hostname}, isLovable=${isLovable}, isLocalhost=${isLocalhost}, devMode=${devMode}`);
    (window as any).__devModeLogged = true;
  }
  
  return devMode;
}

function getDevAgentToken(): string {
  const token = import.meta.env.VITE_DEV_AGENT_TOKEN;
  if (token) return token;
  if (isDevOpenUiAllowed()) {
    console.warn("[DEV OPEN UI] Using hardcoded VITE_DEV_AGENT_TOKEN fallback");
    return DEV_AGENT_TOKEN_FALLBACK;
  }
  throw new Error("❌ BLOCKED: VITE_DEV_AGENT_TOKEN is REQUIRED when devMode=true");
}

function getDevOrgId(): string {
  const orgId = import.meta.env.VITE_DEV_ORG_ID;
  if (orgId) return orgId;
  if (isDevOpenUiAllowed()) {
    console.warn("[DEV OPEN UI] Using hardcoded VITE_DEV_ORG_ID fallback");
    return DEV_ORG_ID_FALLBACK;
  }
  throw new Error("❌ BLOCKED: VITE_DEV_ORG_ID is REQUIRED when devMode=true");
}

function getDevUserId(): string {
  const userId = import.meta.env.VITE_DEV_USER_ID;
  if (userId) return userId;
  if (isDevOpenUiAllowed()) {
    // Prefer child id (most student endpoints), fall back to parent id if needed elsewhere.
    console.warn("[DEV OPEN UI] Using seeded dev user id fallback");
    return DEV_CHILD_ID_FALLBACK;
  }
  throw new Error("❌ BLOCKED: VITE_DEV_USER_ID is REQUIRED when devMode=true");
}

/**
 * Call an edge function with authentication and automatic retry on 401
 * @param functionName - Name of the edge function
 * @param payload - Request payload
 * @param options - Request options including retry settings
 * @returns Response data
 */
export async function callEdgeFunction<TRequest, TResponse>(
  functionName: string,
  payload: TRequest,
  options: { maxRetries?: number; timeoutMs?: number } = {}
): Promise<TResponse> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { ensureSession } = await import("../supabase");
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const { maxRetries = 1, timeoutMs = 30000 } = options;
  const guestMode = isGuestMode();
  const devMode = isDevMode();

  // In dev mode, use agent token auth (bypasses user session issues)
  if (devMode) {
    console.log(`[callEdgeFunction:${functionName}] 🔧 DEV MODE - using agent token auth`);
    return await callEdgeFunctionWithAgentToken<TRequest, TResponse>(
      functionName, 
      payload, 
      { timeoutMs }
    );
  }

  // Get auth token DIRECTLY from session (not cached)
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  let token = session?.access_token || null;
  
  console.log(`[callEdgeFunction:${functionName}] Auth debug @ ${new Date().toISOString()}:`, {
    hasSession: !!session,
    hasToken: !!token,
    tokenLength: token?.length || 0,
    userId: session?.user?.id || 'none',
    userEmail: session?.user?.email || 'none',
    sessionError: sessionError?.message || 'none',
    guestMode
  });

  // Allow anonymous calls in guest mode
  if (!token && !guestMode) {
    console.error(`[callEdgeFunction:${functionName}] No token and not in guest mode - throwing 401`);
    throw new ApiError(
      "User not authenticated",
      "UNAUTHORIZED",
      401
    );
  }

  const url = `${supabaseUrl}/functions/v1/${functionName}`;

  const makeRequest = async (authToken: string | null) => {
    const authHeader = authToken ? `Bearer ${authToken}` : `Bearer ${anonKey}`;
    try {
      return await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
            apikey: anonKey,
          },
          body: JSON.stringify(payload),
        },
        timeoutMs
      );
    } catch (fetchError) {
      // Handle CORS and network errors gracefully
      const errMsg = fetchError instanceof Error ? fetchError.message.toLowerCase() : String(fetchError).toLowerCase();
      if (errMsg.includes('cors') || errMsg.includes('blocked') || errMsg.includes('failed to fetch') ||
          (fetchError instanceof TypeError && errMsg.includes('fetch'))) {
        throw new ApiError(
          `CORS error: Edge function ${functionName} is not accessible from this origin. This may be expected in preview environments.`,
          "CORS_ERROR",
          0, // No HTTP status for CORS errors
          { functionName, url }
        );
      }
      throw fetchError;
    }
  };

  // First attempt
  let res = await makeRequest(token);

  // If 401, try to ensure session and retry
  if (res.status === 401 && maxRetries > 0) {
    console.warn(
      `[API] 401 on ${functionName}, attempting to refresh session...`
    );

    // Try to refresh the session token to get updated metadata
    token = await ensureSession();

    if (!token) {
      // Parse error to check if it's missing organization_id
      const errorText = await res.clone().text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      
      const errorMessage = errorData.message || errorData.error || '';
      if (errorMessage.includes('missing organization_id') || errorMessage.includes('not configured')) {
        throw new ApiError(
          "Your session token doesn't include organization configuration. Please log out and log back in to refresh your session.",
          "SESSION_STALE",
          401,
          errorData
        );
      }
      
      throw new ApiError(
        "Failed to refresh session after 401. Please log out and log back in.",
        "AUTH_REFRESH_FAILED",
        401,
        errorData
      );
    }

    // Retry with new token
    res = await makeRequest(token);

    if (res.status === 401) {
      // Parse the error to provide better guidance
      const errorText = await res.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      
      const errorMessage = errorData.message || errorData.error || '';
      if (errorMessage.includes('missing organization_id') || errorMessage.includes('not configured')) {
        throw new ApiError(
          "Your session token doesn't include organization configuration. Please log out completely and log back in to get a fresh token with updated metadata.",
          "SESSION_STALE",
          401,
          errorData
        );
      }
      
      throw new ApiError(
        "Still unauthorized after session refresh. Your session may be stale. Please log out and log back in.",
        "UNAUTHORIZED",
        401,
        errorData
      );
    }

    console.info(`[API] ✓ Retry successful for ${functionName}`);
  }

  if (!res.ok) {
    const errorText = await res.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText };
    }

    // Improve error messages for authentication issues
    if (res.status === 401) {
      const isLovablePreview = typeof window !== 'undefined' && (
        window.location.hostname.includes('lovable.app') || 
        window.location.hostname.includes('lovableproject.com') ||
        window.location.hostname.includes('lovable')
      );
      const message = isLovablePreview
        ? 'Authentication required. Please log in to use this feature.'
        : errorData.message || 'Authentication required. Please log in.';
      throw new ApiError(
        message,
        "UNAUTHORIZED",
        401,
        errorData
      );
    }

    throw new ApiError(
      errorData.message || `Edge function ${functionName} failed`,
      errorData.error?.code || "API_ERROR",
      res.status,
      errorData
    );
  }

  return res.json() as Promise<TResponse>;
}

/**
 * Check if running in guest/dev bypass mode (no auth required)
 */
export function isGuestMode(): boolean {
  if (typeof window === 'undefined') return false;

  // Production default: guest mode must be explicitly enabled.
  if (import.meta.env.VITE_ENABLE_GUEST !== "true") return false;
  
  // Check URL param
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('guest') === '1') return true;
  
  // Check localStorage
  try {
    if (localStorage.getItem('guestMode') === 'true') return true;
  } catch {
    // localStorage blocked
  }
  
  return false;
}

/**
 * Call an edge function with agent token auth (for dev/preview mode)
 * This bypasses user session and uses a pre-configured agent token
 */
async function callEdgeFunctionWithAgentToken<TRequest, TResponse>(
  functionName: string,
  payload: TRequest,
  options: { timeoutMs?: number; userId?: string } = {}
): Promise<TResponse> {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const { timeoutMs = 30000, userId } = options;

  // In devMode, x-user-id MUST be available (some endpoints require it).
  let effectiveUserId = userId;
  if (!effectiveUserId) {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { session } } = await supabase.auth.getSession();
      effectiveUserId = session?.user?.id || undefined;
    } catch {
      effectiveUserId = undefined;
    }
  }
  if (!effectiveUserId) {
    effectiveUserId = getDevUserId();
  }

  const url = `${supabaseUrl}/functions/v1/${functionName}`;

  console.log(`[callEdgeFunctionWithAgentToken:${functionName}] Making request with agent token`);

  let res: Response;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${anonKey}`,
      "apikey": anonKey,
      "x-agent-token": getDevAgentToken(),
      "x-organization-id": getDevOrgId(),
    };
    headers["x-user-id"] = effectiveUserId;

    res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      },
      timeoutMs
    );
  } catch (fetchError) {
    const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
    console.error(`[callEdgeFunctionWithAgentToken:${functionName}] Fetch error:`, errMsg);
    
    const lowerMsg = errMsg.toLowerCase();
    if (lowerMsg.includes('cors') || lowerMsg.includes('blocked') || lowerMsg.includes('failed to fetch')) {
      // Log more details for debugging
      console.error(`[callEdgeFunctionWithAgentToken:${functionName}] Network/CORS error detected. URL: ${url}`);
      throw new ApiError(
        `Network error calling ${functionName}: ${errMsg}. Check browser console for details.`,
        "NETWORK_ERROR",
        0,
        { functionName, url, originalError: errMsg }
      );
    }
    throw fetchError;
  }

  if (!res.ok) {
    const errorText = await res.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText };
    }
    
    console.error(`[callEdgeFunctionWithAgentToken:${functionName}] Error ${res.status}:`, errorData);
    
    throw new ApiError(
      errorData.message || errorData.error || `Edge function ${functionName} failed`,
      errorData.code || "API_ERROR",
      res.status,
      errorData
    );
  }

  const data = await res.json();
  console.log(`[callEdgeFunctionWithAgentToken:${functionName}] ✅ Success`);
  return data as TResponse;
}

/**
 * Call an edge function with GET method (also supports dev mode)
 */
export async function callEdgeFunctionGet<TResponse>(
  functionName: string,
  params?: Record<string, string>,
  options: { timeoutMs?: number } = {}
): Promise<TResponse> {
  const { getAccessToken } = await import("../supabase");
  const { supabase } = await import("@/integrations/supabase/client");
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const { timeoutMs = 30000 } = options;
  const devMode = isDevMode();

  const queryString = params
    ? `?${new URLSearchParams(params).toString()}`
    : "";
  const url = `${supabaseUrl}/functions/v1/${functionName}${queryString}`;

  // In dev mode, use agent token auth
  if (devMode) {
    console.log(`[callEdgeFunctionGet:${functionName}] 🔧 DEV MODE - using agent token auth`);
  }

  const token = devMode ? null : await getAccessToken();
  const guestMode = isGuestMode();

  // Build headers - add agent token in dev mode
  const headers: Record<string, string> = {
    "Authorization": token ? `Bearer ${token}` : `Bearer ${anonKey}`,
    "apikey": anonKey,
  };
  
  if (devMode) {
    headers["x-agent-token"] = getDevAgentToken();
    headers["x-organization-id"] = getDevOrgId();
    // In devMode, x-user-id MUST be available (some endpoints require it).
    try {
      const { data: { session } } = await supabase.auth.getSession();
      headers["x-user-id"] = session?.user?.id || getDevUserId();
    } catch {
      headers["x-user-id"] = getDevUserId();
    }
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers,
      },
      timeoutMs
    );
  } catch (fetchError) {
    // Handle CORS and network errors gracefully - check BEFORE auth check
    const errMsg = fetchError instanceof Error ? fetchError.message.toLowerCase() : String(fetchError).toLowerCase();
    if (errMsg.includes('cors') || errMsg.includes('blocked') || errMsg.includes('failed to fetch') ||
        (fetchError instanceof TypeError && errMsg.includes('fetch'))) {
      throw new ApiError(
        `CORS error: Edge function ${functionName} is not accessible from this origin. This may be expected in preview environments.`,
        "CORS_ERROR",
        0, // No HTTP status for CORS errors
        { functionName, url }
      );
    }
    throw fetchError;
  }

  // Allow anonymous calls in guest mode - check AFTER fetch attempt (CORS errors handled above)
  if (!res.ok && res.status === 401 && !token && !guestMode) {
    throw new ApiError(
      "User not authenticated",
      "UNAUTHORIZED",
      401
    );
  }

  // Extract requestId from response headers for error tracking
  const requestId = res.headers.get("x-request-id") || undefined;

  if (!res.ok) {
    const errorText = await res.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText };
    }

    // Improve error messages for authentication issues
    if (res.status === 401) {
      const isLovablePreview = typeof window !== 'undefined' && (
        window.location.hostname.includes('lovable.app') || 
        window.location.hostname.includes('lovableproject.com') ||
        window.location.hostname.includes('lovable')
      );
      const message = isLovablePreview
        ? 'Authentication required. Please log in to use this feature.'
        : errorData.message || 'Authentication required. Please log in.';
      throw new ApiError(
        message,
        "UNAUTHORIZED",
        401,
        errorData,
        requestId
      );
    }

    throw new ApiError(
      errorData.message || `Edge function ${functionName} failed`,
      errorData.error?.code || "API_ERROR",
      res.status,
      errorData,
      requestId
    );
  }

  return res.json() as Promise<TResponse>;
}
