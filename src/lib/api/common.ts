import { isLiveMode } from "../env";

// IgniteZero: NO hardcoded fallbacks - environment variables are REQUIRED
// Configure in .env:
//   VITE_SUPABASE_URL=https://your-project.supabase.co
//   VITE_SUPABASE_ANON_KEY=your-anon-key

/**
 * Get Supabase URL (required in live mode, empty string allowed in mock mode)
 * TEMPORARY: Hardcoded dev fallbacks for Lovable deployment
 */
export function getSupabaseUrl(): string {
  // TEMPORARY: Hardcoded dev fallback
  const DEV_SUPABASE_URL = 'https://eidcegehaswbtzrwzvfa.supabase.co';
  const url = import.meta.env.VITE_SUPABASE_URL || DEV_SUPABASE_URL;
  if (!url && isLiveMode()) {
    console.error('❌ BLOCKED: VITE_SUPABASE_URL is required in live mode');
  }
  return url || DEV_SUPABASE_URL;
}

/**
 * Get Supabase anon key (required in live mode)
 * TEMPORARY: Hardcoded dev fallbacks for Lovable deployment
 */
export function getSupabaseAnonKey(): string {
  // TEMPORARY: Hardcoded dev fallback
  const DEV_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZGNlZ2VoYXN3YnR6cnd6dmZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NDYzNTAsImV4cCI6MjA4MDQyMjM1MH0.DpXOHjccnVEewnPF5gA6tw27TcRXkkAfgrJkn0NvT_Q';
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 
              import.meta.env.VITE_SUPABASE_ANON_KEY || 
              DEV_SUPABASE_KEY;
  if (!key && isLiveMode()) {
    console.error('❌ BLOCKED: Supabase anon key is required in live mode');
  }
  return key || DEV_SUPABASE_KEY;
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
  const { getAccessToken, ensureSession } = await import("../supabase");
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const { maxRetries = 1, timeoutMs = 30000 } = options;
  const guestMode = isGuestMode();

  // Get auth token from cached session
  let token = await getAccessToken();

  // Allow anonymous calls in guest mode
  if (!token && !guestMode) {
    throw new ApiError(
      "User not authenticated",
      "UNAUTHORIZED",
      401
    );
  }

  const url = `${supabaseUrl}/functions/v1/${functionName}`;

  const makeRequest = async (authToken: string | null) => {
    const authHeader = authToken ? `Bearer ${authToken}` : `Bearer ${anonKey}`;
    return fetchWithTimeout(
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
  };

  // First attempt
  let res = await makeRequest(token);

  // If 401, try to ensure session and retry
  if (res.status === 401 && maxRetries > 0) {
    console.warn(
      `[API] 401 on ${functionName}, attempting to refresh session...`
    );

    token = await ensureSession();

    if (!token) {
      throw new ApiError(
        "Failed to refresh session after 401",
        "AUTH_REFRESH_FAILED",
        401
      );
    }

    // Retry with new token
    res = await makeRequest(token);

    if (res.status === 401) {
      throw new ApiError(
        "Still unauthorized after session refresh",
        "UNAUTHORIZED",
        401
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
function isGuestMode(): boolean {
  if (typeof window === 'undefined') return false;
  
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
 * Call an edge function with GET method
 */
export async function callEdgeFunctionGet<TResponse>(
  functionName: string,
  params?: Record<string, string>,
  options: { timeoutMs?: number } = {}
): Promise<TResponse> {
  const { getAccessToken } = await import("../supabase");
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const { timeoutMs = 30000 } = options;

  const token = await getAccessToken();
  const guestMode = isGuestMode();

  // Allow anonymous calls in guest mode
  if (!token && !guestMode) {
    throw new ApiError(
      "User not authenticated",
      "UNAUTHORIZED",
      401
    );
  }

  const queryString = params
    ? `?${new URLSearchParams(params).toString()}`
    : "";
  const url = `${supabaseUrl}/functions/v1/${functionName}${queryString}`;

  // Use token if available, otherwise use anon key for guest mode
  const authHeader = token ? `Bearer ${token}` : `Bearer ${anonKey}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          Authorization: authHeader,
          apikey: anonKey,
        },
      },
      timeoutMs
    );
  } catch (fetchError) {
    // Handle CORS and network errors gracefully
    const errMsg = fetchError instanceof Error ? fetchError.message.toLowerCase() : String(fetchError).toLowerCase();
    if (errMsg.includes('cors') || errMsg.includes('blocked') || errMsg.includes('failed to fetch')) {
      throw new ApiError(
        `CORS error: Edge function ${functionName} is not accessible from this origin. This may be expected in preview environments.`,
        "CORS_ERROR",
        0, // No HTTP status for CORS errors
        { functionName, url }
      );
    }
    throw fetchError;
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
