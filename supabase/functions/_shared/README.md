# Edge Function Shared Utilities

This directory contains shared utilities for consistent error handling, observability, and validation across all edge functions.

## Error Handling (`error.ts`)

Centralized error responses with consistent structure across all functions.

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

### Usage

```typescript
import { handleOptions, Errors } from "../_shared/error.ts";

serve(async (req) => {
  // Handle OPTIONS for CORS
  if (req.method === "OPTIONS") return handleOptions();

  try {
    // Validation error (400)
    if (!isValid) {
      return Errors.invalidRequest("Invalid input format");
    }

    // Missing auth (401)
    if (!authHeader) {
      return Errors.noAuth();
    }

    // Invalid token (401)
    if (!user) {
      return Errors.invalidAuth();
    }

    // Permission denied (403)
    if (!hasPermission) {
      return Errors.forbidden("User lacks required permissions");
    }

    // Not found (404)
    if (!resource) {
      return Errors.notFound("Course");
    }

    // Success response
    return new Response(JSON.stringify({ data }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err) {
    // Internal error (500)
    const message = err instanceof Error ? err.message : "Internal error";
    return Errors.internal(message);
  }
});
```

### Available Error Helpers

| Helper | Status | Use Case |
|--------|--------|----------|
| `Errors.invalidRequest(msg)` | 400 | Invalid request payload or parameters |
| `Errors.missingFields(fields)` | 400 | Missing required fields |
| `Errors.noAuth()` | 401 | No authorization header |
| `Errors.invalidAuth()` | 401 | Invalid or expired token |
| `Errors.forbidden(msg)` | 403 | User lacks permissions |
| `Errors.forbiddenOrigin()` | 403 | Origin not allowed |
| `Errors.notFound(resource)` | 404 | Resource not found |
| `Errors.methodNotAllowed(method)` | 405 | HTTP method not allowed |
| `Errors.conflict(msg)` | 409 | Resource conflict |
| `Errors.internal(msg)` | 500 | Internal server error |

### Custom Errors

For custom error responses:
```typescript
import { jsonError } from "../_shared/error.ts";

return jsonError(
  "custom_code",
  "Custom error message",
  418, // Custom status code
  reqId // Optional request ID
);
```

## Observability (`obs.ts`)

Standard headers and request tracking.

### Usage

```typescript
import { stdHeaders, newReqId } from "../_shared/obs.ts";

// Standard CORS + request ID headers
const headers = stdHeaders({ 
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=300"
});

// Generate unique request ID
const reqId = newReqId();
```

### `stdHeaders()`

Returns headers with:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`
- `X-Request-Id: <unique-id>`
- Any additional headers passed as argument

## Origin Checking (`origins.ts`)

Validates request origins against allowlist.

### Usage

```typescript
import { checkOrigin } from "../_shared/origins.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();

  // Check origin (returns error Response if forbidden)
  const originCheck = checkOrigin(req);
  if (originCheck) return originCheck;

  // ... rest of handler
});
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
  return Errors.invalidRequest(formatValidationError(parsed.error));
}

const { courseId, level } = parsed.data;
```

## Migration Guide

To update existing functions:

1. **Replace CORS headers:**
   ```typescript
   // Before
   const corsHeaders = {
     "Access-Control-Allow-Origin": "*",
     "Access-Control-Allow-Headers": "...",
   };

   // After
   import { handleOptions, Errors } from "../_shared/error.ts";
   
   if (req.method === "OPTIONS") return handleOptions();
   ```

2. **Replace error responses:**
   ```typescript
   // Before
   return new Response(
     JSON.stringify({ error: "unauthorized" }),
     { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
   );

   // After
   return Errors.invalidAuth();
   ```

3. **Update validation errors:**
   ```typescript
   // Before
   return new Response(
     JSON.stringify({ error: "invalid_request", message: errorMsg }),
     { status: 400, headers: corsHeaders }
   );

   // After
   return Errors.invalidRequest(errorMsg);
   ```

4. **Update catch blocks:**
   ```typescript
   // Before
   catch (err) {
     return new Response(
       JSON.stringify({ error: "internal_error" }),
       { status: 500, headers: corsHeaders }
     );
   }

   // After
   catch (err) {
     const message = err instanceof Error ? err.message : "Internal error";
     return Errors.internal(message);
   }
   ```

## Benefits

- **Consistency:** All errors follow the same structure
- **Traceability:** Every response includes a unique request ID
- **Debugging:** Timestamp on all errors aids in log correlation
- **DX:** Simpler, cleaner error handling code
- **Standards:** Single source of truth for CORS headers
