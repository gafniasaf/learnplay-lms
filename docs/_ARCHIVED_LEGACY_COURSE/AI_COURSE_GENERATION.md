# AI Course Generation System

## Overview

The AI Course Generation System is a sophisticated pipeline that creates educational courses using a hybrid approach combining deterministic skeleton generation with LLM-powered content filling. The system ensures consistency, correctness, and scalability while maintaining high-quality educational content.

## Architecture

### High-Level Flow

```
User Request
  → Job Creation
  → Strategy Orchestrator
      ├─ Deterministic Builder (knowledge pack) ─┐
      └─ Skeleton Builder → LLM Filler (fallback) ─┤
  → Validator (schema + gates)
  → Storage + Metadata Persistence
  → Catalog Index
```

### Key Components

1. **Strategy Orchestrator** (`generate-course/orchestrator.ts`) - Chooses deterministic vs AI path, unifies validation/persistence, and handles fallbacks.
2. **Deterministic Builder** (`_shared/deterministic.ts`) - Compiles complete courses from curated knowledge packs.
3. **Skeleton Builder** (`_shared/skeleton.ts`) - Deterministic structure generator used when no pack exists.
4. **LLM Filler** (`_shared/filler.ts`) - Adds natural language content to skeletons under strict constraints.
5. **Validator** (`_shared/course-validator.ts` + `_shared/gates.ts`) - Schema, placeholder, math, lexicon, readability, and banned-term checks.
6. **Persistence Layer** (`generate-course/index.ts` + `_shared/metadata.ts`) - Stores course JSON and upserts metadata indexes.
7. **Catalog** - Searchable surface for generated courses.

## Core Modules

### 1. Skeleton Builder (`skeleton.ts`)

**Purpose**: Creates a deterministic, reproducible course structure without LLM involvement.

**Features**:
- Deterministic RNG for consistent outputs
- Subject analysis (math, language, science)
- Automatic group and level generation
- Math metadata for validation

**Example Usage**:
```typescript
import { buildSkeleton } from './skeleton.ts';

const skeleton = buildSkeleton({
  subject: 'addition',
  grade: '1st Grade',
  itemsPerGroup: 12,
  levelsCount: 3,
  mode: 'options',
});

// Returns:
// - id: 'addition'
// - groups: [{ id: 0, name: 'Addition' }]
// - levels: [{ id: 1, start: 0, end: 11 }, ...]
// - items: [...] with _meta for math validation
// - studyTexts: [...] with __FILL__ placeholders
```

**Math Detection**:
- Supports: addition, subtraction, multiplication, division
- Generates metadata: `{ op, a, b, expected }`
- Enables automatic correctness validation

### 2. LLM Filler (`filler.ts`)

**Purpose**: Fills skeleton placeholders with educational content via LLM.

**Process**:
1. Builds structured prompt with constraints
2. Calls LLM (OpenAI GPT-4o or Anthropic Claude)
3. Parses JSON response
4. Merges content back into skeleton structure

**Key Constraints**:
- NEVER modify IDs, groupId, clusterId, variant, mode
- Exactly one `[blank]` per item.text
- 3-4 options for options mode
- Numeric answers for numeric mode
- Follow math metadata if present

**Example**:
```typescript
import { fillSkeleton } from './filler.ts';

const result = await fillSkeleton(skeleton, {
  requestId: 'req-123',
  functionName: 'generate-course',
}, 90000);

if (result.ok) {
  const filledCourse = result.course;
  // All __FILL__ placeholders now contain real content
}
```

### 3. Course Validator (`course-validator.ts`)

**Purpose**: Programmatic validation without LLM calls.

**Validation Checks**:
1. **Schema validation** - Zod schema compliance
2. **Placeholder count** - Exactly one `[blank]` per item
3. **Options validation** - 3-4 options, valid correctIndex
4. **Numeric validation** - Proper answer field
5. **Math correctness** - Verifies against _meta
6. **Study text completeness** - No __FILL__ remaining
7. **Section markers** - Presence of [SECTION:...] tags

**Example**:
```typescript
import { validateCourse } from './course-validator.ts';

const result = validateCourse(filledCourse);

if (!result.valid) {
  console.error('Validation errors:', result.issues);
  result.issues.forEach(issue => {
    console.log(`${issue.severity}: ${issue.code} at ${issue.path}`);
    console.log(issue.message);
  });
}
```

**Issue Types**:
- `error` - Blocks course publication
- `warning` - Non-blocking suggestions

## Edge Functions

### `generate-course` (v70)

**Endpoint**: `POST /functions/v1/generate-course`

**Request Body**:
```json
{
  "subject": "dinosaurs",
  "title": "Dinosaurs: A Journey Through Time",
  "gradeBand": "3rd Grade",
  "grade": "3rd Grade",
  "itemsPerGroup": 12,
  "levelsCount": 3,
  "mode": "options"
}
```

**Process**:
1. **Strategy Selection**  
   - Try deterministic knowledge pack via `_shared/deterministic.ts`.  
   - If no pack exists or compilation fails, fall back to `_shared/skeleton.ts` + `_shared/filler.ts`.
2. **Validation Pipeline** (`_shared/course-validator.ts`)  
   - Zod schema, placeholder counts, math correctness.  
   - Knowledge-pack gates (`_shared/gates.ts`) for lexicon, banned terms, readability.  
3. **Persistence** (`generate-course/index.ts`)  
   - Upload `courses/{courseId}/course.json` to Supabase Storage.  
   - Upsert metadata into `course_metadata` + legacy `courses` via `_shared/metadata.ts`.  
4. **Job Completion**  
   - Persist structured job summary (bucket + `ai_course_jobs.summary`).  
   - Mark job `status=done`, record deterministic pack info, validation counts, and optional fallback reason.
5. **Fallback Handling**  
   - If LLM filling fails or validation returns errors, a deterministic placeholder course is generated and persisted so that clients still receive schema-valid JSON.

**Response**:
```json
{
  "success": true,
  "course": { "...": "..." },
  "source": "deterministic",
  "imagesPending": 0,
  "imagesNote": "Images can be generated via enqueue-course-media",
  "metadata": {
    "subject": "dinosaurs",
    "title": "Dinosaurs: A Journey Through Time",
    "gradeBand": "3rd Grade",
    "mode": "options",
    "generatedAt": "2025-11-15T02:13:44.000Z",
    "validationWarnings": 0
  }
}
```

**Error Handling & Fallbacks**:
- 403: Authentication / RLS rejections.
- 500: Uncaught runtime errors (after job marked `failed`).
- LLM failures → deterministic placeholder course + job marked done with `fallback_reason`.
- Validation failures → deterministic placeholder course + recorded issues.
- All fallbacks still write `courses/{courseId}/course.json` so catalog/UI remain consistent.

### `list-courses` (v20)

**Endpoint**: `GET /functions/v1/list-courses`

**Query Parameters**:
- `page` (default: 1)
- `limit` (default: 20, max: 100)
- `search` - Searches `title`, `subject`, `id`
- `tags` - Comma-separated tag slugs
- `sort` - `newest`, `oldest`, `title_asc`, `title_desc`

**Search Logic** (v20):
```typescript
query.or(`title.ilike.%${search}%,subject.ilike.%${search}%,id.ilike.%${search}%`)
```

**Response**:
```json
{
  "items": [
    {
      "id": "dinosaurs-507633",
      "title": "Dinosaurs: A Journey Through Time",
      "subject": "dinosaurs",
      "grade": "3rd Grade",
      "itemCount": 36,
      "visibility": "public",
      "createdAt": "2025-11-14T18:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20,
  "totalPages": 3
}
```

**Visibility Rules**:
- Unauthenticated: Only `visibility='public'` courses
- Authenticated: Own org courses + public courses

## Database Schema

### `courses` Table

Stores course metadata (NOT full course JSON).

```sql
CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  name TEXT,
  subject TEXT,
  grade_band TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_courses_subject ON courses(subject);
CREATE INDEX idx_courses_grade_band ON courses(grade_band);
```

### `course_metadata` Table

Catalog index for searchable course discovery.

```sql
CREATE TABLE course_metadata (
  id TEXT PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  title TEXT,           -- NEW: v70
  subject TEXT,         -- NEW: v70
  grade_band TEXT,      -- NEW: v70
  tags JSONB DEFAULT '{}',
  tag_ids UUID[] DEFAULT ARRAY[]::UUID[],
  visibility TEXT DEFAULT 'public',  -- 'public' or 'org'
  etag TEXT,
  content_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_course_metadata_title ON course_metadata(title);
CREATE INDEX idx_course_metadata_subject ON course_metadata(subject);
CREATE INDEX idx_course_metadata_org ON course_metadata(organization_id);
CREATE INDEX idx_course_metadata_visibility ON course_metadata(visibility);
```

**Migration**: `add_searchable_fields_to_course_metadata.sql`

### Storage Bucket: `courses`

Stores full course JSON files.

**Path Structure**: `{course_id}/course.json`

**Example**:
- `dinosaurs-507633/course.json`
- `multiplication-and-division-829401/course.json`

## Course JSON Schema

```typescript
interface Course {
  id: string;
  title: string;
  description: string;
  subject: string;
  gradeBand: string;
  contentVersion: string;
  
  groups: Array<{
    id: number;
    name: string;
  }>;
  
  levels: Array<{
    id: number;
    title: string;
    start: number;  // Item index
    end: number;    // Item index
  }>;
  
  studyTexts: Array<{
    id: string;
    title: string;
    order: number;
    content: string;  // Supports [SECTION:...] and [IMAGE:...] markers
  }>;
  
  items: Array<{
    id: number;
    text: string;           // Contains exactly one [blank]
    groupId: number;
    clusterId: string;
    variant: "1" | "2" | "3";
    mode: "options" | "numeric";
    
    // Options mode:
    options?: string[];     // 3-4 choices
    correctIndex?: number;  // 0-based index
    
    // Numeric mode:
    answer?: number;
    
    // Optional validation metadata:
    _meta?: {
      op?: "add" | "sub" | "mul" | "div";
      a?: number;
      b?: number;
      expected?: number;
    };
  }>;
}
```

## Testing

### Jest Tests

**Unit Tests**:
- `skeleton.test.ts` - 100% coverage, 40 tests
- `course-validator.test.ts` - 98% coverage, 31 tests

**Run Tests**:
```bash
npm test                    # All unit tests
npm run test:coverage       # With coverage report
npm test -- --testPathPattern=skeleton    # Specific module
```

**Coverage Targets**:
- Statements: 88%
- Branches: 70%
- Functions: 90%
- Lines: 90%

### E2E Tests (Playwright)

**Test Files**:
- `course-generation-full.spec.ts` - Full UI workflow
- `api-generate-course.spec.ts` - API smoke tests

**Run E2E**:
```bash
npm run e2e                      # Headless mode
npm run e2e:headed               # With browser UI
npm run e2e:report               # View last report
npm run e2e:full                 # Full course generation test
```

**Key E2E Scenarios**:
1. Generate course through UI
2. Monitor real-time status updates
3. Verify course appears in catalog
4. Search for generated course
5. Handle review feedback
6. Detect stuck jobs

## API Keys Configuration

**Location**: Supabase Dashboard → Edge Functions → Manage secrets

**Required Keys**:
- `OPENAI_API_KEY` - Primary LLM provider
- `ANTHROPIC_API_KEY` - Fallback LLM provider (note: uses hyphen, not underscore)

**Usage Priority**:
1. OpenAI GPT-4o (default)
2. Anthropic Claude 3.5 Sonnet (fallback)

## Deployment

### Edge Function Deployment

```bash
# Via Supabase CLI
supabase functions deploy generate-course
supabase functions deploy list-courses

# Via MCP (from agent context)
call_mcp_tool('deploy_edge_function', {
  name: 'generate-course',
  files: [...],
  entrypoint_path: 'index.ts'
})
```

**Version History**:
- `generate-course`: v70 (latest) - Populates `title`, `subject`, `grade_band`
- `list-courses`: v20 (latest) - Searches across `title`, `subject`, `id`

### Database Migrations

```bash
# Apply migrations
npm run migration:apply

# Key migrations:
# - create_courses_table
# - add_searchable_fields_to_course_metadata
# - remove_courses_data_column
```

## Troubleshooting

### Common Issues

**1. Course Not Appearing in Catalog**

**Symptoms**: Generated course doesn't show in search results.

**Causes**:
- Missing `course_metadata` entry
- Empty `title` or `subject` fields
- Incorrect `visibility` setting

**Fix**:
```sql
-- Check if metadata exists
SELECT * FROM course_metadata WHERE id = 'your-course-id';

-- Verify searchable fields
SELECT id, title, subject, visibility FROM course_metadata;

-- Update if needed
UPDATE course_metadata 
SET title = 'Correct Title', subject = 'correct-subject'
WHERE id = 'your-course-id';
```

**2. Search Returns No Results**

**Symptoms**: Searching for "dinosaurs" doesn't find "Dinosaurs" course.

**Cause**: Old v19 `list-courses` only searched `id` column.

**Fix**: Deployed v20 with multi-column search:
```typescript
query.or(`title.ilike.%${search}%,subject.ilike.%${search}%,id.ilike.%${search}%`)
```

**3. LLM Errors (403)**

**Symptoms**: `LLM error (403)` in logs.

**Causes**:
- Invalid/revoked API key
- Incorrect key format

**Fix**:
1. Go to Supabase Dashboard → Edge Functions → Manage secrets
2. Verify `OPENAI_API_KEY` (updated Nov 10)
3. Check `ANTHROPIC_API_KEY` format (uses hyphen: `ANTHROPIC-API-KEY`)

**4. Validation Failures**

**Symptoms**: Course generation completes but validation fails.

**Causes**:
- LLM didn't follow instructions
- Missing [blank] placeholders
- Incorrect option counts
- Math answer mismatch

**Debug**:
```typescript
const result = validateCourse(course);
console.log('Validation:', result);

result.issues.forEach(issue => {
  if (issue.severity === 'error') {
    console.error(`ERROR: ${issue.code} at ${issue.path}`);
    console.error(issue.message);
  }
});
```

### Monitoring

**Check Edge Function Logs**:
```bash
# Via Supabase CLI
supabase functions logs generate-course --tail

# Via MCP
call_mcp_tool('get_logs', { service: 'edge-function' })
```

**Check Advisory Notices**:
```bash
call_mcp_tool('get_advisors', { type: 'security' })
call_mcp_tool('get_advisors', { type: 'performance' })
```

## Performance

### Metrics

- **Skeleton Generation**: < 50ms (deterministic)
- **LLM Filling**: 20-90s (depends on course size)
- **Validation**: < 100ms (programmatic)
- **Storage Upload**: < 500ms
- **Database Insert**: < 100ms
- **Total Time**: ~25-95s per course

### Optimization Tips

1. **Batch Operations**: Generate multiple courses in parallel
2. **Caching**: Reuse skeletons for similar subjects
3. **LLM Timeout**: Adjust based on course complexity
4. **Storage**: Use CDN for course JSON files
5. **Database**: Index searchable fields

## Future Enhancements

### Planned Features

1. **Image Generation**: Async image creation for [IMAGE:...] markers
2. **Audio Support**: Text-to-speech for study materials
3. **Adaptive Difficulty**: Dynamic item generation based on student performance
4. **Multi-Language**: Course translation support
5. **Version Control**: Course history and rollback
6. **Analytics**: Track course usage and effectiveness
7. **A/B Testing**: Compare course variants

### API Improvements

1. **Streaming**: Real-time course generation progress
2. **Webhooks**: Notify on completion
3. **Bulk Operations**: Generate multiple courses in one request
4. **Templates**: Predefined course structures
5. **Custom Validators**: Plugin system for domain-specific validation

## Contributing

### Adding New Subject Types

1. Update `analyzeSubject()` in `skeleton.ts`
2. Add study text templates
3. Create validation rules if needed
4. Add tests to `skeleton.test.ts`

### Adding Validation Rules

1. Add to `validateCourse()` in `course-validator.ts`
2. Define issue code and severity
3. Add test cases to `course-validator.test.ts`
4. Update documentation

### Testing Checklist

- [ ] Unit tests pass (`npm test`)
- [ ] Coverage > 90% (`npm run test:coverage`)
- [ ] E2E tests pass (`npm run e2e`)
- [ ] Manual testing in UI
- [ ] Check logs for errors
- [ ] Verify catalog search
- [ ] Test edge cases

## Resources

- **Supabase Docs**: https://supabase.com/docs
- **OpenAI API**: https://platform.openai.com/docs
- **Anthropic API**: https://docs.anthropic.com/
- **Zod Validation**: https://zod.dev/
- **Playwright**: https://playwright.dev/

## Support

For issues or questions:
1. Check logs: `supabase functions logs`
2. Review validation errors
3. Check database state
4. Verify API keys
5. Run diagnostics: `npm run diag`

---

*Last Updated: November 14, 2025*  
*System Version: v70 (generate-course), v20 (list-courses)*
