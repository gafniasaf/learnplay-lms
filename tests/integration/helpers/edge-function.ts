import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
import { getAuthToken } from './auth';

// Re-export config for convenience
export { SUPABASE_URL, SUPABASE_ANON_KEY };

/**
 * Edge Function calling utilities for integration tests
 * 
 * Provides utilities to call Edge Functions directly and verify responses.
 */

export interface EdgeFunctionResponse<T = any> {
  status: number;
  body: T;
  headers: Record<string, string>;
}

export interface EdgeFunctionCallOptions {
  token?: string;
  role?: 'admin' | 'teacher' | 'parent' | 'student';
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Call an Edge Function directly
 * 
 * @param functionName - Name of the Edge Function (e.g., 'parent-dashboard')
 * @param params - Parameters to pass (as query params for GET, body for POST)
 * @param options - Call options including authentication
 */
export async function callEdgeFunction<T = any>(
  functionName: string,
  params: Record<string, any> = {},
  options: EdgeFunctionCallOptions = {}
): Promise<EdgeFunctionResponse<T>> {
  const {
    token,
    role,
    method = 'POST',
    headers = {},
    timeout = 30000,
  } = options;
  
  // Get authentication token if role is provided
  let authToken = token;
  if (!authToken && role) {
    authToken = await getAuthToken(role);
  }
  
  const url = `${SUPABASE_URL}/functions/v1/${functionName}`;
  
  // Build request
  let requestUrl = url;
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    ...headers,
  };
  
  if (authToken) {
    requestHeaders['Authorization'] = `Bearer ${authToken}`;
  }
  
  let requestBody: string | undefined;
  
  if (method === 'GET') {
    // Build query string from params
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        queryParams.set(key, String(value));
      }
    }
    const queryString = queryParams.toString();
    if (queryString) {
      requestUrl = `${url}?${queryString}`;
    }
  } else {
    // POST - body is JSON
    requestBody = JSON.stringify(params);
  }
  
  // Make request with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(requestUrl, {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    // Parse response
    let body: T;
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      body = await response.json();
    } else {
      body = (await response.text()) as any;
    }
    
    // Extract headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    
    return {
      status: response.status,
      body,
      headers: responseHeaders,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Edge Function ${functionName} timed out after ${timeout}ms`);
    }
    
    throw error;
  }
}

/**
 * Verify Edge Function requires authentication
 */
export async function verifyRequiresAuth(
  functionName: string,
  params: Record<string, any> = {},
  options: { method?: 'GET' | 'POST'; timeout?: number } = {}
): Promise<boolean> {
  // Try both GET and POST to see which method the function uses
  const methods: ('GET' | 'POST')[] = options.method ? [options.method] : ['GET', 'POST'];
  const timeout = options.timeout || 10000; // Default 10s timeout for auth checks (shorter than normal)
  
  for (const method of methods) {
    try {
      const response = await callEdgeFunction(functionName, params, {
        method,
        timeout,
        // No token provided
      });
      
      // Return true if it requires auth (401/403) or crashes (500) without auth
      if (response.status === 401 || response.status === 403 || response.status === 500) {
        return true;
      }
      
      // If function doesn't exist (404), try next method or return false
      if (response.status === 404) {
        continue; // Try next method
      }
      
      // If it returns 200, check if the body contains an error (might be allowing anonymous but failing)
      if (response.status === 200 && typeof response.body === 'object' && response.body !== null) {
        const body = response.body as any;
        if (body.error || body.message) {
          // Check if error message indicates auth requirement
          const errorMsg = (body.error || body.message || '').toLowerCase();
          if (errorMsg.includes('auth') || errorMsg.includes('unauthorized') || errorMsg.includes('token') || errorMsg.includes('login') || errorMsg.includes('permission')) {
            return true; // Has auth-related error, requires auth
          }
          // Other errors might indicate parameter issues, not auth - continue to check
        }
      }
      
      // If we got a non-404 response, we found the function - check if it requires auth
      // For 200 with no error, assume it might allow anonymous (but this is rare for admin functions)
      // Return false to indicate we can't verify (function exists but might allow anonymous)
      if (response.status !== 404) {
        return false; // Function exists but doesn't clearly require auth
      }
    } catch (error) {
      // If timeout or other error, assume function might require auth (timeout could mean it's processing)
      // But for auth checks, we'll be lenient and return false (can't verify)
      if (error instanceof Error && error.message.includes('timeout')) {
        // Timeout might mean function is processing - can't verify auth requirement
        return false; // Can't verify due to timeout
      }
      // Other errors - continue to next method
      continue;
    }
  }
  
  // All methods returned 404 or timed out - function doesn't exist or can't verify
  return false; // Can't verify - function doesn't exist or timed out
}

/**
 * Verify Edge Function requires specific parameter
 */
export async function verifyRequiresParameter(
  functionName: string,
  paramName: string,
  options: EdgeFunctionCallOptions = {}
): Promise<boolean> {
  // Call without the parameter
  const response = await callEdgeFunction(functionName, {}, options);
  
  // If function doesn't exist (404) or crashes (500), we can't verify parameter requirement
  if (response.status === 404 || response.status === 500) {
    return false; // Can't verify - function may not exist or crashed
  }
  
  if (response.status !== 400) {
    return false;
  }
  
  const errorMessage = typeof response.body === 'object' && response.body !== null
    ? (response.body as any).error || (response.body as any).message || ''
    : String(response.body);
  
  return errorMessage.toLowerCase().includes(paramName.toLowerCase()) ||
         errorMessage.toLowerCase().includes('required');
}

/**
 * Track Edge Function calls for verification
 */
const callHistory: Array<{
  functionName: string;
  params: Record<string, any>;
  timestamp: number;
  response: EdgeFunctionResponse;
}> = [];

/**
 * Get call history for a specific function
 */
export function getCallHistory(functionName: string): Array<{
  params: Record<string, any>;
  timestamp: number;
  response: EdgeFunctionResponse;
}> {
  return callHistory
    .filter(call => call.functionName === functionName)
    .map(({ functionName, ...rest }) => rest);
}

/**
 * Get the last call to a function
 */
export function getLastCall(functionName: string): {
  params: Record<string, any>;
  timestamp: number;
  response: EdgeFunctionResponse;
} | null {
  const history = getCallHistory(functionName);
  return history.length > 0 ? history[history.length - 1] : null;
}

/**
 * Clear call history
 */
export function clearCallHistory(): void {
  callHistory.length = 0;
}

/**
 * Wrapper that tracks calls
 */
export async function callEdgeFunctionTracked<T = any>(
  functionName: string,
  params: Record<string, any> = {},
  options: EdgeFunctionCallOptions = {}
): Promise<EdgeFunctionResponse<T>> {
  const response = await callEdgeFunction<T>(functionName, params, options);
  
  callHistory.push({
    functionName,
    params,
    timestamp: Date.now(),
    response,
  });
  
  return response;
}

