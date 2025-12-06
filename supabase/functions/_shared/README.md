# Edge Function Shared Utilities

This directory contains shared utilities for consistent error handling, CORS, and validation across all edge functions.

## CORS Handling (`cors.ts`)

All CORS, headers, and request tracking utilities are centralized in `cors.ts`.

### Quick Start (Recommended Pattern)

```typescript
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { withCors, newReqId } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";

serve(withCors(async (req) => {
  const reqId = req.headers.get("x-request-id") || newReqId();

  // Return plain objects - withCors handles Response wrapping and CORS
  if (!isValid) {
    return Errors.invalidRequest("Invalid input format", reqId);
  }

  // Success - return plain object
  return { ok: true, data: result };
}));
```

### Available Exports from `cors.ts`

| Export | Description |
|--------|-------------|
| `withCors(handler)` | Wraps handler with automatic CORS headers |
| `stdHeaders(req, extra)` | Generate CORS + security headers |
| `handleOptions(req, reqId)` | Handle OPTIONS preflight |
| `newReqId()` | Generate unique request ID |
| `getRequestId(req)` | Extract or generate request ID |

### Manual CORS (if needed)

```typescript
import { stdHeaders, handleOptions, newReqId } from "../_shared/cors.ts";

serve(async (req) => {
  const reqId = newReqId();

  if (req.method === "OPTIONS") {
    return handleOptions(req, reqId);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: stdHeaders(req, { "Content-Type": "application/json" })
  });
});
```

## Error Handling (`error.ts`)

Centralized error helpers that work seamlessly with `withCors`.

### Standard Error Shape

All errors return this structure:
```json
{
  "error": {
    "code": "error_code",
    "message": "Human-readable message"
  },
  "requestId": "unique-request-id",
  "timestamp": "2025-01-20T05:22:00.000Z"
}
```

### Usage with withCors (Recommended)

```typescript
import { withCors, newReqId } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";

serve(withCors(async (req) => {
  const reqId = req.headers.get("x-request-id") || newReqId();

  // Validation error (400)
  if (!isValid) {
    return Errors.invalidRequest("Invalid input format", reqId);
  }

  // Missing auth (401)
  if (!authHeader) {
    return Errors.noAuth(reqId);
  }

  // Not found (404)
  if (!resource) {
    return Errors.notFound("Course", reqId);
  }

  // Success - return plain object
  return { ok: true, data };
}));
```

### Available Error Helpers

| Helper | Status | Use Case |
|--------|--------|----------|
| `Errors.invalidRequest(msg, reqId)` | 400 | Invalid request payload or parameters |
| `Errors.missingFields(fields, reqId)` | 400 | Missing required fields |
| `Errors.noAuth(reqId)` | 401 | No authorization header |
| `Errors.invalidAuth(reqId)` | 401 | Invalid or expired token |
| `Errors.forbidden(msg, reqId)` | 403 | User lacks permissions |
| `Errors.forbiddenOrigin(reqId)` | 403 | Origin not allowed |
| `Errors.notFound(resource, reqId)` | 404 | Resource not found |
| `Errors.methodNotAllowed(method, reqId)` | 405 | HTTP method not allowed |
| `Errors.conflict(msg, reqId)` | 409 | Resource conflict |
| `Errors.internal(msg, reqId)` | 500 | Internal server error |

## Origin Checking (`origins.ts`)

Validates request origins against allowlist.

### Usage

```typescript
import { checkOrigin } from "../_shared/origins.ts";

serve(withCors(async (req) => {
  // Check origin (returns error object if forbidden)
  const originCheck = checkOrigin(req);
  if (originCheck) return originCheck;

  // ... rest of handler
}));
```

## Validation (`validation.ts`)

Zod schemas for input validation.

### Usage

```typescript
import { StartRoundSchema, formatValidationError } from "../_shared/validation.ts";
import { Errors } from "../_shared/error.ts";

const json = await req.json();
const parsed = StartRoundSchema.safeParse(json);

if (!parsed.success) {
  return Errors.invalidRequest(formatValidationError(parsed.error), reqId);
}

const { courseId, level } = parsed.data;
```

## Deprecated: `obs.ts`

⚠️ **Deprecated** - All utilities have been moved to `cors.ts`.

For backward compatibility, `obs.ts` re-exports from `cors.ts`:
```typescript
// Old (still works but deprecated)
import { stdHeaders, newReqId } from "../_shared/obs.ts";

// New (preferred)
import { stdHeaders, newReqId } from "../_shared/cors.ts";
```

## Migration Guide

### From corsHeaders pattern:

```typescript
// ❌ OLD - Don't use
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "...",
};
return new Response(data, { headers: corsHeaders });

// ✅ NEW - Use withCors wrapper
import { withCors } from "../_shared/cors.ts";

serve(withCors(async (req) => {
  return { ok: true, data };  // CORS headers added automatically
}));
```

### From manual error responses:

```typescript
// ❌ OLD
return new Response(
  JSON.stringify({ error: "unauthorized" }),
  { status: 401, headers: corsHeaders }
);

// ✅ NEW
return Errors.invalidAuth(reqId);
```

## Benefits

- **Consistency:** All errors follow the same structure
- **Automatic CORS:** `withCors` handles all CORS complexity
- **Traceability:** Every response includes a unique request ID
- **Security:** CSP and security headers included automatically
- **DX:** Return plain objects instead of Response construction
