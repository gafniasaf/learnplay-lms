import { isLiveMode } from "../env";

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
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const { maxRetries = 1, timeoutMs = 30000 } = options;

  if (!supabaseUrl) {
    throw new ApiError(
      "VITE_SUPABASE_URL is not configured",
      "CONFIG_ERROR"
    );
  }

  // Get auth token from cached session
  let token = await getAccessToken();

  if (!token) {
    throw new ApiError(
      "User not authenticated",
      "UNAUTHORIZED",
      401
    );
  }

  const url = `${supabaseUrl}/functions/v1/${functionName}`;

  const makeRequest = async (authToken: string) => {
    return fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
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
 * Call an edge function with GET method
 */
export async function callEdgeFunctionGet<TResponse>(
  functionName: string,
  params?: Record<string, string>,
  options: { timeoutMs?: number } = {}
): Promise<TResponse> {
  const { getAccessToken } = await import("../supabase");
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const { timeoutMs = 30000 } = options;

  if (!supabaseUrl) {
    throw new ApiError(
      "VITE_SUPABASE_URL is not configured",
      "CONFIG_ERROR"
    );
  }

  const token = await getAccessToken();

  if (!token) {
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

  const res = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    timeoutMs
  );

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
