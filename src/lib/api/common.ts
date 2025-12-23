import { isLiveMode } from "../env";
import { getRuntimeConfigSync } from "@/lib/runtimeConfig";

// IgniteZero: NO hardcoded fallbacks - environment variables are REQUIRED
// Configure in .env:
//   VITE_SUPABASE_URL=https://your-project.supabase.co
//   VITE_SUPABASE_ANON_KEY=your-anon-key

// Force product-like behavior even on localhost (used by live Playwright runs)
const FORCE_LIVE = import.meta.env.VITE_FORCE_LIVE === "true";

/**
 * Debug toggles (client-side).
 *
 * IMPORTANT: avoid spamming console in production/preview environments.
 * Enable explicitly with either:
 * - URL: ?debugEdgeAuth=1
 * - localStorage: iz_debug_edge_auth=1
 */
function isEdgeAuthDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debugEdgeAuth") === "1") return true;
  } catch {
    // ignore
  }
  try {
    return window.localStorage.getItem("iz_debug_edge_auth") === "1";
  } catch {
    return false;
  }
}

const lastAuthDebugAtByFn = new Map<string, number>();
function maybeLogEdgeAuthDebug(functionName: string, data: Record<string, unknown>) {
  if (!isEdgeAuthDebugEnabled()) return;
  const now = Date.now();
  const last = lastAuthDebugAtByFn.get(functionName) ?? 0;
  // Rate limit to once per 30s per function to avoid runaway console spam.
  if (now - last < 30_000) return;
  lastAuthDebugAtByFn.set(functionName, now);
  // Use debug so it’s filterable.
  console.debug(`[callEdgeFunction:${functionName}] Auth debug @ ${new Date().toISOString()}:`, data);
}

/**
 * Explicit dev bypass mode that uses agent-token auth for Edge functions.
 * This is intended for development-only stability when user auth/metadata is not ready.
 */
export function isDevAgentMode(): boolean {
  // Allow disabling dev-agent for the current tab without changing app-config.json
  // (useful when you want to test real Supabase session auth).
  if (typeof window !== "undefined") {
    try {
      if (window.sessionStorage.getItem("iz_dev_agent_disabled") === "1") return false;
    } catch {
      // ignore
    }
    try {
      if (window.localStorage.getItem("iz_dev_agent_disabled") === "1") return false;
    } catch {
      // ignore
    }
  }

  // Env var wins (local dev / CI)
  if (import.meta.env.VITE_DEV_AGENT_MODE === "true") return true;

  // Runtime config can enable the mode (e.g. Lovable), but credentials must still come from env.
  if (getRuntimeConfigSync()?.devAgent?.enabled === true) return true;

  // Localhost/dev environment: enable dev agent mode automatically for local development
  // (unless FORCE_LIVE is set, which forces product-like behavior for testing)
  if (!FORCE_LIVE && typeof window !== "undefined") {
    const h = window.location.hostname || "";
    const isLocalhost = h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.startsWith("192.168.") || h.startsWith("10.") || h.startsWith("172.16.");
    if (isLocalhost) {
      // In localhost, allow dev agent mode (user can still disable via storage if needed)
      return true;
    }
  }

  // Lovable safety net:
  // In iframe/preview environments Supabase auth persistence can be unreliable and sessions can go stale.
  // On Lovable preview hosts, default to dev-agent mode (unless explicitly disabled for this tab).
  //
  // IMPORTANT:
  // - We still FAIL LOUDLY if dev-agent credentials are missing (no fallbacks).
  // - Users can opt out via iz_dev_agent_disabled to test real Supabase auth.
  if (typeof window !== "undefined") {
    const h = window.location.hostname || "";
    const isLovable =
      h.includes("lovable.app") || h.includes("lovableproject.com") || h.includes("lovable.dev");
    if (isLovable) {
      if (!FORCE_LIVE) return true;
    }
  }

  return false;
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

function extractStructuredFailure(data: unknown):
  | { code: string; message: string; httpStatus?: number; details?: unknown }
  | null {
  if (!data || typeof data !== "object") return null;
  const d: any = data as any;

  // Common edge shape: { ok:false, error:{ code, message }, httpStatus? }
  if (d.ok === false) {
    const err = d.error;
    const code = typeof err?.code === "string" ? err.code : "error";
    const message =
      typeof err?.message === "string"
        ? err.message
        : typeof d.error === "string"
          ? d.error
          : "Request failed";
    const httpStatus = typeof d.httpStatus === "number" ? d.httpStatus : undefined;
    return { code, message, httpStatus, details: d };
  }

  // Some handlers use: { success:false, error:{ code, message } }
  if (d.success === false) {
    const err = d.error;
    const code = typeof err?.code === "string" ? err.code : "error";
    const message =
      typeof err?.message === "string"
        ? err.message
        : "Request failed";
    const httpStatus = typeof d.httpStatus === "number" ? d.httpStatus : undefined;
    return { code, message, httpStatus, details: d };
  }

  return null;
}

/**
 * Fetch with timeout and retry logic
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  // In some preview/iframe environments AbortController may not reliably abort
  // an in-flight fetch. We therefore ALSO race the fetch against a timer that
  // rejects regardless, and attempt abort as best-effort.
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<Response>((_, reject) => {
    timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch {
        // ignore
      }
      reject(
        new ApiError(
          "Request timeout",
          "TIMEOUT",
          408,
          { url, timeoutMs }
        )
      );
    }, timeoutMs);
  });

  try {
    const fetchPromise = fetch(url, {
      ...options,
      signal: controller.signal,
    });

    // Whichever completes first (fetch or timeout) wins.
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch (error) {
    // If abort propagates as AbortError, normalize to our ApiError.
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(
        "Request timeout",
        "TIMEOUT",
        408,
        { url, timeoutMs }
      );
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function shouldUseAgentTokenAuth(): boolean {
  if (FORCE_LIVE) return false;
  if (isDevAgentMode()) return true;

  // Extra Lovable safety net:
  // In iframe/preview environments Supabase auth persistence can be unreliable and sessions can go stale.
  // If the developer provided dev-agent credentials via URL/sessionStorage, prefer agent auth for stability.
  if (typeof window !== "undefined") {
    const h = window.location.hostname || "";
    const isLovable =
      h.includes("lovable.app") || h.includes("lovableproject.com") || h.includes("lovable.dev");
    if (isLovable) {
      // Respect explicit opt-out for this tab.
      try {
        if (window.sessionStorage.getItem("iz_dev_agent_disabled") === "1") return false;
      } catch {
        // ignore
      }
      try {
        if (window.localStorage.getItem("iz_dev_agent_disabled") === "1") return false;
      } catch {
        // ignore
      }

      const token = getStorageValue("iz_dev_agent_token");
      const orgId = getStorageValue("iz_dev_org_id");
      if (token && orgId) return true;
    }
  }

  return false;
}

function getStorageValue(key: string): string | null {
  if (typeof window === "undefined") return null;

  // Lovable/iframe environments can block sessionStorage/localStorage. Keep a small in-memory
  // escape hatch so dev-agent credentials can still be provided via URL params or setup UIs.
  try {
    const mem = (globalThis as any).__izDevAgent as Record<string, unknown> | undefined;
    const v = mem?.[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch {
    // ignore
  }
  // Prefer sessionStorage for iframe/preview stability.
  try {
    const v = window.sessionStorage.getItem(key);
    if (v) return v;
  } catch {
    // ignore
  }
  try {
    const v = window.localStorage.getItem(key);
    if (v) return v;
  } catch {
    // ignore
  }

  // Final fallback for dev-agent keys: allow reading from URL params when storage is unavailable.
  // NOTE: This is intended for preview-only flows (Lovable). Do not rely on it for production auth.
  try {
    const params = new URLSearchParams(window.location.search);
    if (key === "iz_dev_agent_token") {
      const token = params.get("iz_dev_agent_token") || params.get("devAgentToken") || params.get("agentToken");
      if (token?.trim()) return token.trim();
    }
    if (key === "iz_dev_org_id") {
      const orgId = params.get("iz_dev_org_id") || params.get("devOrgId") || params.get("orgId");
      if (orgId?.trim()) return orgId.trim();
    }
    if (key === "iz_dev_user_id") {
      const userId = params.get("iz_dev_user_id") || params.get("devUserId") || params.get("userId");
      if (userId?.trim()) return userId.trim();
    }
  } catch {
    // ignore
  }
  return null;
}

function getDevAgentToken(): string {
  const token =
    (import.meta.env.VITE_DEV_AGENT_TOKEN as string | undefined) ||
    getStorageValue("iz_dev_agent_token") ||
    undefined;
  if (!token) {
    throw new Error(
      "❌ BLOCKED: Dev-agent token missing.\n" +
        "Set VITE_DEV_AGENT_TOKEN (preferred) or in the browser console:\n" +
        "  sessionStorage.setItem('iz_dev_agent_token','<token>')"
    );
  }
  return token;
}

function getDevOrgId(): string {
  const orgId =
    (import.meta.env.VITE_DEV_ORG_ID as string | undefined) ||
    getStorageValue("iz_dev_org_id") ||
    undefined;
  if (!orgId) {
    throw new Error(
      "❌ BLOCKED: Dev-org id missing.\n" +
        "Set VITE_DEV_ORG_ID (preferred) or in the browser console:\n" +
        "  sessionStorage.setItem('iz_dev_org_id','<org_uuid>')"
    );
  }
  return orgId;
}

function getDevUserId(): string {
  const userId =
    (import.meta.env.VITE_DEV_USER_ID as string | undefined) ||
    getStorageValue("iz_dev_user_id") ||
    undefined;
  if (userId) return userId;

  // In preview/dev-agent mode, the user id is used for auditing and some endpoints.
  // If the developer hasn't provided one, generate a stable per-browser UUID and persist it.
  // This avoids requiring Supabase Auth (which can fail to persist in iframes).
  if (typeof window !== "undefined") {
    try {
      const generated = crypto.randomUUID();
      try {
        window.sessionStorage.setItem("iz_dev_user_id", generated);
      } catch {
        // ignore
      }
      try {
        window.localStorage.setItem("iz_dev_user_id", generated);
      } catch {
        // ignore
      }
      return generated;
    } catch {
      // ignore
    }
  }

  // Last resort: keep existing behavior (explicit failure) when we cannot generate/persist.
  throw new Error(
    "❌ BLOCKED: Dev-user id missing.\n" +
      "Set VITE_DEV_USER_ID (preferred) or in the browser console:\n" +
      "  sessionStorage.setItem('iz_dev_user_id','<user_uuid>')"
  );
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
  options: { maxRetries?: number; timeoutMs?: number; idempotencyKey?: string } = {}
): Promise<TResponse> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { ensureSession } = await import("../supabase");
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const { maxRetries = 1, timeoutMs = 30000, idempotencyKey } = options;
  const devAgentMode = shouldUseAgentTokenAuth();

  // In dev agent mode, use agent token auth (bypasses user session issues)
  if (devAgentMode) {
    if (isEdgeAuthDebugEnabled()) {
      console.debug(`[callEdgeFunction:${functionName}] 🔧 DEV AGENT MODE - using agent token auth`);
    }
    return await callEdgeFunctionWithAgentToken<TRequest, TResponse>(
      functionName, 
      payload, 
      { timeoutMs }
    );
  }

  // Get auth token DIRECTLY from session (not cached)
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  let token = session?.access_token || null;
  
  maybeLogEdgeAuthDebug(functionName, {
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
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: authHeader,
          apikey: anonKey,
        };
        // Idempotency-Key is used to safely retry POST operations like enqueue-job in preview environments.
        if (idempotencyKey) {
          headers["Idempotency-Key"] = idempotencyKey;
        }
        return await fetchWithTimeout(
          url,
          {
            method: "POST",
            headers,
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
          console.warn(`[callEdgeFunction:${functionName}] transient network error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoffMs}ms`, {
            error: fetchError,
            errorMessage: errMsg,
            url,
            hasToken: !!authToken,
          });
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
          console.error(`[callEdgeFunction:${functionName}] All ${maxRetries + 1} attempts failed. Network diagnostics:`, {
            url,
            hasToken: !!authToken,
            isLovable: typeof window !== 'undefined' && window.location.hostname.includes('lovable'),
            origin: typeof window !== 'undefined' ? window.location.origin : 'N/A',
            errorMessage: errMsg,
          });
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

  const data = await res.json().catch(() => null) as any;
  const failure = extractStructuredFailure(data);
  // Some endpoints intentionally return ok:false for transient network blips; callers handle this.
  if (failure?.code === "transient_network") {
    return data as TResponse;
  }
  if (failure) {
    throw new ApiError(
      failure.message,
      failure.code,
      failure.httpStatus ?? 400,
      failure.details,
      data?.requestId
    );
  }
  return data as TResponse;
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
    // Prefer explicit dev identity (URL/sessionStorage/localStorage/env) over Supabase session user.
    // This makes Lovable preview stable even when a stale/incorrect Supabase session exists.
    const explicit = getStorageValue("iz_dev_user_id") || (import.meta.env.VITE_DEV_USER_ID as string | undefined);
    if (explicit) {
      effectiveUserId = explicit;
    }
  }
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

  if (isEdgeAuthDebugEnabled()) {
    console.debug(`[callEdgeFunctionWithAgentToken:${functionName}] Making request with agent token`);
  }

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

    // If dev-agent auth was attempted but rejected, prompt the user to re-enter credentials.
    // This typically happens when a placeholder token was stored, or when the AGENT_TOKEN changed.
    if (typeof window !== "undefined" && res.status === 401) {
      try {
        window.sessionStorage.setItem("iz_dev_agent_invalid", "1");
      } catch {
        // ignore
      }
      try {
        const g = globalThis as any;
        g.__izDevAgentInvalid = true;
      } catch {
        // ignore
      }
      try {
        window.dispatchEvent(new CustomEvent("iz:dev-agent-invalid"));
      } catch {
        // ignore
      }
    }
    
    throw new ApiError(
      errorData.message || errorData.error || `Edge function ${functionName} failed`,
      errorData.code || "API_ERROR",
      res.status,
      errorData
    );
  }

  const data = await res.json().catch(() => null) as any;
  const failure = extractStructuredFailure(data);
  if (failure?.code === "transient_network") {
    return data as TResponse;
  }
  if (failure && typeof window !== "undefined") {
    const msg = typeof failure.message === "string" ? failure.message : "";
    const isUnauthorized =
      failure.httpStatus === 401 ||
      failure.code === "unauthorized" ||
      msg.toLowerCase().includes("unauthorized");
    if (isUnauthorized) {
      try {
        window.sessionStorage.setItem("iz_dev_agent_invalid", "1");
      } catch {
        // ignore
      }
      try {
        const g = globalThis as any;
        g.__izDevAgentInvalid = true;
      } catch {
        // ignore
      }
      try {
        window.dispatchEvent(new CustomEvent("iz:dev-agent-invalid"));
      } catch {
        // ignore
      }
    }
  }
  if (failure) {
    throw new ApiError(
      failure.message,
      failure.code,
      failure.httpStatus ?? 400,
      failure.details
    );
  }
  if (isEdgeAuthDebugEnabled()) {
    console.debug(`[callEdgeFunctionWithAgentToken:${functionName}] ✅ Success`);
  }
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
    // Prefer explicit dev identity (URL/sessionStorage/localStorage/env) over Supabase session user.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const explicit = getStorageValue("iz_dev_user_id") || (import.meta.env.VITE_DEV_USER_ID as string | undefined);
      headers["x-user-id"] = explicit || session?.user?.id || getDevUserId();
    } catch {
      const explicit = getStorageValue("iz_dev_user_id") || (import.meta.env.VITE_DEV_USER_ID as string | undefined);
      headers["x-user-id"] = explicit || getDevUserId();
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

  const data = await res.json().catch(() => null) as any;
  const failure = extractStructuredFailure(data);
  if (failure?.code === "transient_network") {
    return data as TResponse;
  }
  if (failure) {
    throw new ApiError(
      failure.message,
      failure.code,
      failure.httpStatus ?? 400,
      failure.details,
      data?.requestId
    );
  }
  return data as TResponse;
}

/**
 * Call an edge function with GET method and return the raw Response.
 *
 * This is used when callers need access to headers/status (e.g. ETag/304 handling)
 * but still want consistent auth/dev-agent headers and transient retry behavior.
 */
export async function callEdgeFunctionGetRaw(
  functionName: string,
  params?: Record<string, string>,
  options: { timeoutMs?: number; maxRetries?: number } = {}
): Promise<Response> {
  const { getAccessToken } = await import("../supabase");
  const { supabase } = await import("@/integrations/supabase/client");
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const { timeoutMs = 30000, maxRetries = 1 } = options;
  const devAgentMode = shouldUseAgentTokenAuth();

  const queryString = params ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${supabaseUrl}/functions/v1/${functionName}${queryString}`;

  const token = devAgentMode ? null : await getAccessToken();

  const headers: Record<string, string> = {
    Authorization: token ? `Bearer ${token}` : `Bearer ${anonKey}`,
    apikey: anonKey,
  };

  if (devAgentMode) {
    headers["x-agent-token"] = getDevAgentToken();
    headers["x-organization-id"] = getDevOrgId();
    // In devMode, x-user-id MUST be available (some endpoints require it).
    // Prefer explicit dev identity (URL/sessionStorage/localStorage/env) over Supabase session user.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const explicit = getStorageValue("iz_dev_user_id") || (import.meta.env.VITE_DEV_USER_ID as string | undefined);
      headers["x-user-id"] = explicit || session?.user?.id || getDevUserId();
    } catch {
      const explicit = getStorageValue("iz_dev_user_id") || (import.meta.env.VITE_DEV_USER_ID as string | undefined);
      headers["x-user-id"] = explicit || getDevUserId();
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
            `[callEdgeFunctionGetRaw:${functionName}] transient error ${res.status} (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoffMs}ms`
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
          `[callEdgeFunctionGetRaw:${functionName}] transient network error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoffMs}ms`,
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

  return res;
}
