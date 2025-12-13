import { isLiveMode } from "../env";
import { getRuntimeConfigSync } from "@/lib/runtimeConfig";

// IgniteZero: NO hardcoded fallbacks - environment variables are REQUIRED
// Configure in .env:
//   VITE_SUPABASE_URL=https://your-project.supabase.co
//   VITE_SUPABASE_ANON_KEY=your-anon-key

// Force product-like behavior even on localhost (used by live Playwright runs)
const FORCE_LIVE = import.meta.env.VITE_FORCE_LIVE === "true";

/**
 * Explicit dev bypass mode that uses agent-token auth for Edge functions.
 * This is intended for development-only stability when user auth/metadata is not ready.
 */
export function isDevAgentMode(): boolean {
  // Env var wins (local dev / CI)
  if (import.meta.env.VITE_DEV_AGENT_MODE === "true") return true;

  // Runtime config can enable the mode (e.g. Lovable), but credentials must still come from env.
  return getRuntimeConfigSync()?.devAgent?.enabled === true;
}

/**
 * Get Supabase URL
 */
export function getSupabaseUrl(): string {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (url) return url;

  const cfgUrl = getRuntimeConfigSync()?.supabase?.url;
  if (cfgUrl) return cfgUrl;

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

  const cfgKey = getRuntimeConfigSync()?.supabase?.publishableKey;
  if (cfgKey) return cfgKey;

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
  // Mock responses are forbidden: fail loudly if anything tries to run in non-live mode.
  if (!isLiveMode()) {
    throw new Error("❌ MOCK MODE FORBIDDEN: mock responses are not allowed. Implement the missing backend instead.");
  }
  return false;
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

function shouldUseAgentTokenAuth(): boolean {
  if (FORCE_LIVE) return false;
  return isDevAgentMode();
}

function getDevAgentToken(): string {
  const token = import.meta.env.VITE_DEV_AGENT_TOKEN as string | undefined;
  if (!token) {
    throw new Error("❌ BLOCKED: VITE_DEV_AGENT_TOKEN is REQUIRED when dev agent mode is enabled");
  }
  return token;
}

function getDevOrgId(): string {
  const orgId = import.meta.env.VITE_DEV_ORG_ID as string | undefined;
  if (!orgId) {
    throw new Error("❌ BLOCKED: VITE_DEV_ORG_ID is REQUIRED when dev agent mode is enabled");
  }
  return orgId;
}

function getDevUserId(): string {
  const userId = import.meta.env.VITE_DEV_USER_ID as string | undefined;
  if (!userId) {
    throw new Error("❌ BLOCKED: VITE_DEV_USER_ID is REQUIRED when dev agent mode is enabled (or provide a logged-in session)");
  }
  return userId;
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
  const devAgentMode = shouldUseAgentTokenAuth();

  // In dev agent mode, use agent token auth (bypasses user session issues)
  if (devAgentMode) {
    console.log(`[callEdgeFunction:${functionName}] 🔧 DEV AGENT MODE - using agent token auth`);
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
  });

  if (!token) {
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
    const body = JSON.stringify(payload);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
            body,
          },
          timeoutMs
        );
      } catch (fetchError) {
        const errMsg =
          fetchError instanceof Error ? fetchError.message.toLowerCase() : String(fetchError).toLowerCase();

        const isLikelyNetworkError =
          errMsg.includes("failed to fetch") ||
          errMsg.includes("insufficient_resources") ||
          errMsg.includes("network") ||
          (fetchError instanceof TypeError && errMsg.includes("fetch"));

        // Retry transient browser/network failures (Playwright can hit net::ERR_INSUFFICIENT_RESOURCES).
        if (isLikelyNetworkError && attempt < maxRetries) {
          const backoffMs = 250 * Math.pow(2, attempt);
          console.warn(`[callEdgeFunction:${functionName}] transient network error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoffMs}ms`, fetchError);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        // Only label as CORS when the message is explicitly CORS-ish. "failed to fetch" is ambiguous.
        const isLikelyCorsError = errMsg.includes("cors") || errMsg.includes("blocked");
        if (isLikelyCorsError) {
          throw new ApiError(
            `CORS error: Edge function ${functionName} is not accessible from this origin. This may be expected in preview environments.`,
            "CORS_ERROR",
            0, // No HTTP status for CORS errors
            { functionName, url }
          );
        }

        if (isLikelyNetworkError) {
          throw new ApiError(
            `Network error calling Edge function ${functionName}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
            "NETWORK_ERROR",
            0,
            { functionName, url }
          );
        }

        throw fetchError;
      }
    }

    // Should be unreachable; loop returns or throws.
    throw new ApiError(`Unexpected error calling Edge function ${functionName}`, "UNKNOWN_ERROR", 0, { functionName, url });
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
  // Guest bypass is intentionally disabled; dev bypass should use VITE_DEV_AGENT_MODE.
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
  options: { timeoutMs?: number; maxRetries?: number } = {}
): Promise<TResponse> {
  const { getAccessToken } = await import("../supabase");
  const { supabase } = await import("@/integrations/supabase/client");
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const { timeoutMs = 30000, maxRetries = 1 } = options;
  const devAgentMode = shouldUseAgentTokenAuth();

  const queryString = params
    ? `?${new URLSearchParams(params).toString()}`
    : "";
  const url = `${supabaseUrl}/functions/v1/${functionName}${queryString}`;

  // In dev agent mode, use agent token auth
  if (devAgentMode) {
    console.log(`[callEdgeFunctionGet:${functionName}] 🔧 DEV AGENT MODE - using agent token auth`);
  }

  const token = devAgentMode ? null : await getAccessToken();

  // Build headers - add agent token in dev mode
  const headers: Record<string, string> = {
    "Authorization": token ? `Bearer ${token}` : `Bearer ${anonKey}`,
    "apikey": anonKey,
  };
  
  if (devAgentMode) {
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

  const isLikelyCorsError = (msg: string) => msg.includes("cors") || msg.includes("blocked");
  const isLikelyNetworkError = (err: unknown): boolean => {
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    return (
      msg.includes("failed to fetch") ||
      msg.includes("network") ||
      msg.includes("connection lost") ||
      msg.includes("connection reset") ||
      msg.includes("insufficient_resources") ||
      (err instanceof TypeError && msg.includes("fetch"))
    );
  };

  const isRetryableStatus = (status: number, bodyText?: string): boolean => {
    if (status === 502 || status === 503 || status === 504) return true;
    // Lovable preview sometimes surfaces transient connection issues as 500 with this string.
    if (status === 500 && bodyText) {
      const t = bodyText.toLowerCase();
      return t.includes("network connection lost") || t.includes("connection lost") || t.includes("connection reset");
    }
    return false;
  };

  let res: Response | null = null;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      res = await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers,
        },
        timeoutMs
      );

      if (!res.ok && attempt < maxRetries) {
        const bodyText = await res.clone().text();
        if (isRetryableStatus(res.status, bodyText)) {
          const backoffMs = 250 * Math.pow(2, attempt);
          console.warn(
            `[callEdgeFunctionGet:${functionName}] transient error ${res.status} (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoffMs}ms`
          );
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
      }

      break;
    } catch (fetchError) {
      lastErr = fetchError;
      const msg = fetchError instanceof Error ? fetchError.message.toLowerCase() : String(fetchError).toLowerCase();

      if (attempt < maxRetries && isLikelyNetworkError(fetchError)) {
        const backoffMs = 250 * Math.pow(2, attempt);
        console.warn(
          `[callEdgeFunctionGet:${functionName}] transient network error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoffMs}ms`,
          fetchError
        );
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      if (isLikelyCorsError(msg)) {
        throw new ApiError(
          `CORS error: Edge function ${functionName} is not accessible from this origin. This may be expected in preview environments.`,
          "CORS_ERROR",
          0,
          { functionName, url }
        );
      }

      if (isLikelyNetworkError(fetchError)) {
        throw new ApiError(
          `Network error calling Edge function ${functionName}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
          "NETWORK_ERROR",
          0,
          { functionName, url }
        );
      }

      throw fetchError;
    }
  }

  if (!res) {
    throw new ApiError(
      `Network error calling Edge function ${functionName}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
      "NETWORK_ERROR",
      0,
      { functionName, url }
    );
  }

  if (!res.ok && res.status === 401 && !token) {
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
