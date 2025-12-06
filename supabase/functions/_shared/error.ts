// supabase/functions/_shared/error.ts
// Centralized error response utilities with CORS

import { stdHeaders } from "./cors.ts";

/**
 * Standard error response shape
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
  requestId: string;
  timestamp: string;
}

/**
 * Create a standardized JSON success response with CORS
 * Note: When used with withCors wrapper, don't add stdHeaders to avoid duplicates
 */
export function jsonOk(body: Record<string, any>, requestId: string, req?: Request, extra?: HeadersInit) {
  return new Response(JSON.stringify({ ...body, requestId }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...(extra || {}) },
  });
}

/**
 * Create a standardized error object (not a Response)
 * The withCors wrapper will convert this to a proper Response
 */
export function createErrorObject(code: string, message: string, status: number, requestId: string) {
  return {
    _error: true,
    _status: status,
    error: { code, message },
    requestId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a standardized JSON error response with CORS
 * @deprecated Use Errors helpers instead which work better with withCors
 * @param req - Optional Request object (origin will be extracted from it)
 */
export function jsonError(code: string, message: string, status: number, requestId: string, req?: Request) {
  return new Response(JSON.stringify({ 
    error: { code, message }, 
    requestId,
    timestamp: new Date().toISOString(),
  }), {
    status,
    headers: { ...stdHeaders(req), "Content-Type": "application/json" },
  });
}

// withCors moved to cors.ts - import from there instead

/**
 * Common error responses (return plain objects, not Responses)
 */
export const Errors = {
  /** 400 - Invalid request payload or parameters */
  invalidRequest: (message: string, reqId: string, _req?: Request) =>
    createErrorObject("invalid_request", message, 400, reqId),

  /** 400 - Missing required fields */
  missingFields: (fields: string[], reqId: string, _req?: Request) =>
    createErrorObject(
      "missing_required_fields",
      `Missing required fields: ${fields.join(", ")}`,
      400,
      reqId
    ),

  /** 401 - No authorization header */
  noAuth: (reqId: string, _req?: Request) =>
    createErrorObject("unauthorized", "Authorization header required", 401, reqId),

  /** 401 - Invalid or expired token */
  invalidAuth: (reqId: string, _req?: Request) =>
    createErrorObject("unauthorized", "Invalid or expired authentication token", 401, reqId),

  /** 403 - User lacks required permissions */
  forbidden: (message: string, reqId: string, _req?: Request) =>
    createErrorObject("forbidden", message, 403, reqId),

  /** 403 - Origin not allowed */
  forbiddenOrigin: (reqId: string, _req?: Request) =>
    createErrorObject("forbidden_origin", "Request origin not allowed", 403, reqId),

  /** 404 - Resource not found */
  notFound: (resource: string, reqId: string, _req?: Request) =>
    createErrorObject("not_found", `${resource} not found`, 404, reqId),

  /** 405 - Method not allowed */
  methodNotAllowed: (method: string, reqId: string, _req?: Request) =>
    createErrorObject(
      "method_not_allowed",
      `HTTP method ${method} not allowed`,
      405,
      reqId
    ),

  /** 409 - Resource conflict */
  conflict: (message: string, reqId: string, _req?: Request) =>
    createErrorObject("conflict", message, 409, reqId),

  /** 500 - Internal server error */
  internal: (message: string, reqId: string, _req?: Request) =>
    createErrorObject("internal_error", message, 500, reqId),
};
