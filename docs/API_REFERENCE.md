# Complete API Reference

## Environment Configuration

### Frontend Environment Variables
```env
VITE_SUPABASE_URL=https://grffepyrmjihphldyfha.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Edge Function Base URL
```typescript
const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
```

---

## Authentication

All authenticated endpoints require:
```
Authorization: Bearer <supabase-access-token>
```

---

## CORS

Most endpoints use a centralized wrapper at `supabase/functions/_shared/cors.ts` that:
- Echoes the request Origin when present (or `*` when missing)
- Merges `Access-Control-Allow-Headers` from the preflight request with standard headers
- Exposes `ETag`, `X-Request-Id`, and other useful headers

Some legacy endpoints still return `Access-Control-Allow-Origin: *` for compatibility.

---

## Endpoints Summary

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/list-courses` | GET | ✓ | List courses with pagination/filtering |
| `/list-courses-filtered` | GET | ✓ | List courses with advanced filters |
| `/play-session` | POST/GET/PATCH | ✓ | Manage play sessions |
| `/assignment-metadata` | GET | ✓ | Get assignment metadata |
| `/results-detail` | GET | ✓/Public | Get detailed round results |
| `/admin-create-tag` | POST | ✓ Admin | Create tags (admin only) |
| `/generate-course` | POST | ✓ Admin | Initiate AI course generation |
| `/ai-job-runner` | Internal | System | Process AI generation jobs |
| `/ai-media-runner` | Internal | System | Process media generation jobs |
| `/org-config` | GET | ✓ | Get organization configuration |
| `/publish-course` | POST | ✓ Admin | Publish a course version |
| `/restore-course-version` | POST | ✓ Admin | Restore previous course version |

---

## Detailed API Documentation

See individual documentation files:
- [Courses Catalog API](./COURSES_CATALOG_API.md)
- [Play Session API](./PLAY_SESSION_API.md)
- [Results Detail API](./RESULTS_DETAIL_API.md)
- [Parent API](./PARENT_API.md)
- [Parent Insights API](./PARENT_INSIGHTS_API.md)
- [Student Achievements & Goals API](./ACHIEVEMENTS_GOALS_API.md)
- [Admin Tag API](./ADMIN_TAG_API.md)
- [Classes & Assignments API](./CLASSES_ASSIGNMENTS_API.md)
- [Messaging API](./MESSAGING_API.md)
- [API Tests](./API_TESTS.md)
- [Internal/Extended Endpoints Index](./INTERNAL_ENDPOINTS.md)
