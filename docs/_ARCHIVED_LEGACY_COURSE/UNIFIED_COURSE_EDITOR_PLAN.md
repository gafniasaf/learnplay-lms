# Unified Course Editor - Architecture Plan

> Legacy notice: This plan documents the deprecated course-era editor. Ignite Zero's Project/Task manifest keeps it archived for historical context; none of the APIs described here (including the old course loader) exist in the current system.

**Status:** In Development  
**Created:** 2025-10-25  
**Owner:** Admin Team

## Overview

A parallel editor page that loads an existing course and provides granular editing for stems, answer options, HTML reference text, and media—with AI-assisted rewrites, semantic media search powered by pgvector, and bulk exercise generation.

---

## Goals

1. **Granular editing** of course items (stem text + media, option text + media, reference HTML + media).
2. **AI-assisted workflows** with compare/adopt for text rewrites and media generation.
3. **Semantic search** across Supabase storage (media assets) and course content (stems/options/reference) using pgvector.
4. **Bulk exercise generation** with AI, preview, and selective adoption.
5. **Version-safe updates** with minimal JSON Patch-like ops, storage writes, and `contentVersion` bumps.

---

## Architecture

### Routing & Page

- **Route:** `/admin/editor/:courseId`
- **Component:** `src/pages/admin/CourseEditor.tsx`
- **Layout:** 3-column grid
  - **Left (280px):** Navigator (groups → items), unsaved-change badges.
  - **Center (flex):** Editor tabs [Stem | Options | Reference | New Exercises], text editors, media grids.
  - **Right (360px):** Compare panel (original vs proposed), AI actions, Media Library (Supabase) with semantic search.

### Data Flow

#### Load

- **API:** Legacy course loader (removed alongside `src/lib/api/course.ts`)
- **State:**
  - `originalCourse`: immutable snapshot from storage.
  - `currentDraft`: local mutable state (nested stem/options/reference per item).
  - `proposedChanges`: AI-generated alternatives (kept separate until adopted).

#### Draft Model (per item)

```typescript
{
  stem: {
    text: string;
    media?: Array<{ id: string; type: 'image'|'audio'|'video'; url: string; alt?: string; }>;
  };
  options: Array<{
    id: string;
    text: string;
    media?: Array<{ id: string; type: 'image'|'audio'|'video'; url: string; alt?: string; }>;
  }>;
  referenceHtml?: string;
  referenceMedia?: Array<{ id: string; type: 'image'|'audio'|'video'; url: string; alt?: string; }>;
}
```

#### Save

- **Endpoint:** `POST /functions/v1/update-course`
- **Payload:**
  ```json
  {
    "courseId": "string",
    "ops": [
      { "op": "replace", "path": "/groups/0/items/2/stem/text", "value": "..." },
      { "op": "add", "path": "/groups/0/items/2/stem/media/-", "value": {...} }
    ]
  }
  ```
- **Server logic:**
  - Validate ops (path structure, permissions).
  - Apply patches to in-memory course JSON.
  - Bump `contentVersion`.
  - Write to storage (`courses/{courseId}.json`).
  - Return updated course + new `etag`.
- **Client:** Merge server response back into `originalCourse`, clear draft flags.

#### Media Adoption

- **Temp storage:** `media/temp/{sessionId}/...`
- **Canonical:** `media/courses/{courseId}/{itemId}/...` or `media/library/...` for shared assets.
- **Flow:**
  1. AI generates preview → stored in temp with signed URL.
  2. User adopts → server moves temp → canonical, updates course JSON refs.
  3. Cleanup: delete temp on session expiry (24h cron job).

---

## Semantic Search (pgvector)

### Extension

- **Migration:** `supabase/migrations/YYYYMMDDHHMMSS_enable_pgvector.sql`
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```

### Tables

#### `media_assets`

Stores metadata + embeddings for all media in Supabase storage.

```sql
CREATE TABLE media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket TEXT NOT NULL,           -- 'media'
  path TEXT NOT NULL,              -- 'courses/{courseId}/{itemId}/image.png'
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,             -- for audio/video
  alt_text TEXT,
  tags TEXT[],
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  embedding vector(1536),          -- OpenAI text-embedding-3-small dimension
  UNIQUE(bucket, path)
);

CREATE INDEX ON media_assets USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON media_assets (bucket, mime_type);
CREATE INDEX ON media_assets (uploaded_by);
```

**RLS:**
```sql
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all media_assets"
  ON media_assets FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert media_assets"
  ON media_assets FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
```

**Embedding generation:**
- On upload: Edge Function `upload-media` generates embedding from `alt_text + tags + filename` via OpenAI Embedding API, inserts row.
- Backfill: Migration script iterates existing storage, generates embeddings.

#### `content_embeddings`

Stores embeddings for course content (stems, options, reference text).

```sql
CREATE TABLE content_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id TEXT NOT NULL,
  group_index INTEGER,
  item_index INTEGER,
  content_type TEXT NOT NULL,      -- 'stem' | 'option' | 'reference'
  option_id TEXT,                  -- for 'option' type
  text_content TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON content_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON content_embeddings (course_id, group_index, item_index);
CREATE INDEX ON content_embeddings (content_type);
```

**RLS:**
```sql
ALTER TABLE content_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all content_embeddings"
  ON content_embeddings FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
```

**Population:**
- On course creation/update: Trigger or Edge Function regenerates embeddings for changed items.
- Backfill: Migration script processes all existing courses.

### Edge Functions (Semantic Search)

#### `search-media`

**Request:**
```json
{
  "query": "clock showing 13:00",
  "filters": {
    "mimeType": "image/*",       // optional
    "uploadedBy": "userId",      // optional
    "tags": ["clock", "time"]    // optional
  },
  "limit": 20,
  "offset": 0
}
```

**Logic:**
1. Generate embedding for `query` via OpenAI.
2. Query `media_assets` with vector similarity search:
   ```sql
   SELECT id, bucket, path, mime_type, width, height, alt_text, tags,
          1 - (embedding <=> $embedding) AS similarity
   FROM media_assets
   WHERE mime_type LIKE $mimeTypeFilter
     AND ($tags IS NULL OR tags && $tags)
   ORDER BY embedding <=> $embedding
   LIMIT $limit OFFSET $offset;
   ```
3. Generate signed URLs for each asset (24h expiry).
4. Return ranked results with metadata.

**Response:**
```json
{
  "results": [
    {
      "id": "uuid",
      "url": "https://...",
      "mimeType": "image/png",
      "width": 800,
      "height": 600,
      "alt": "Analog clock showing 1:00 PM",
      "tags": ["clock", "time", "24-hour"],
      "similarity": 0.92
    }
  ],
  "total": 145,
  "limit": 20,
  "offset": 0
}
```

#### `search-content`

**Request:**
```json
{
  "query": "multiplication tables practice",
  "scope": {
    "courseId": "math-grade-3",  // optional: search within one course
    "contentTypes": ["stem", "option", "reference"]
  },
  "limit": 20
}
```

**Logic:**
1. Generate embedding for `query`.
2. Query `content_embeddings`:
   ```sql
   SELECT course_id, group_index, item_index, content_type, option_id, text_content,
          1 - (embedding <=> $embedding) AS similarity
   FROM content_embeddings
   WHERE ($courseId IS NULL OR course_id = $courseId)
     AND content_type = ANY($contentTypes)
   ORDER BY embedding <=> $embedding
   LIMIT $limit;
   ```
3. Return ranked content snippets.

**Response:**
```json
{
  "results": [
    {
      "courseId": "math-grade-3",
      "groupIndex": 2,
      "itemIndex": 5,
      "contentType": "stem",
      "text": "What is 7 × 8?",
      "similarity": 0.88
    }
  ]
}
```

---

## AI Functions

### `ai-rewrite-text`

**Request:**
```json
{
  "segmentType": "stem" | "option" | "reference",
  "currentText": "What time is it?",
  "context": {
    "subject": "Mathematics",
    "gradeBand": "Elementary",
    "difficulty": "intermediate"
  },
  "styleHints": ["simplify", "add_visual_cue"]
}
```

**Logic:**
1. Construct prompt with context + style hints.
2. Call OpenAI Chat Completions API.
3. Return 2-3 candidate rewrites with rationales.

**Response:**
```json
{
  "candidates": [
    {
      "text": "Look at the clock. What time does it show?",
      "rationale": "Simplified language, added visual cue."
    }
  ]
}
```

### `ai-generate-media`

**Request:**
```json
{
  "prompt": "An analog clock showing 13:00 in 24-hour format, colorful, child-friendly",
  "kind": "image" | "audio",
  "options": {
    "size": "1024x1024",
    "aspectRatio": "16:9",
    "style": "cartoon"
  }
}
```

**Logic:**
1. For images: call DALL-E 3 or Stable Diffusion API.
2. For audio: call TTS API (e.g., ElevenLabs, Google TTS).
3. Upload result to `media/temp/{sessionId}/...`.
4. Generate embedding from prompt + alt text.
5. Insert row into `media_assets` (temp bucket).

**Response:**
```json
{
  "id": "uuid",
  "url": "https://.../temp/...",
  "mimeType": "image/png",
  "width": 1024,
  "height": 1024,
  "alt": "Analog clock showing 13:00"
}
```

### `ai-generate-exercises`

**Request:**
```json
{
  "courseId": "time-grade-1",
  "count": 5,
  "modes": ["options", "numeric"],
  "difficulty": "intermediate",
  "topics": ["24-hour format", "analog clocks"]
}
```

**Logic:**
1. Load course header + sample items for context.
2. Generate structured prompt.
3. Call OpenAI with JSON schema enforcement.
4. Validate generated items (schema, required fields).
5. Return array of new items (flagged as `_aiGenerated: true`).

**Response:**
```json
{
  "items": [
    {
      "_aiGenerated": true,
      "mode": "options",
      "stem": { "text": "What is 15:00 in 12-hour format?" },
      "options": [...],
      "answer": 1,
      "difficulty": "intermediate"
    }
  ]
}
```

### `update-course`

**Request:**
```json
{
  "courseId": "time-grade-1",
  "ops": [
    { "op": "replace", "path": "/groups/0/items/2/stem/text", "value": "New stem text" },
    { "op": "add", "path": "/groups/0/items/2/stem/media/-", "value": { "id": "uuid", "type": "image", "url": "..." } }
  ]
}
```

**Logic:**
1. Load course from storage.
2. Validate ops (paths exist, values conform to schema).
3. Apply patches via `jsonpatch` library.
4. Bump `contentVersion`.
5. Write updated JSON to `courses/{courseId}.json`.
6. Regenerate embeddings for changed items (async queue).
7. Return new course JSON + `etag`.

**Response:**
```json
{
  "course": { ... },
  "contentVersion": 6,
  "etag": "abc123"
}
```

---

## Editor Features (per tab)

### Stem Tab

- **Text editor:** Markdown/HTML toggle, word/reading-time counters.
- **Media region:** Grid of current media + "Add media" cards.
- **Actions:**
  - "AI Rewrite" → opens compare panel with candidates.
  - "AI Generate Media" → form (prompt/style) → temp preview in compare panel.
  - "Select from Library" → opens MediaLibraryPanel with semantic search.
  - "Upload" / "From URL" → traditional file picker.
- **Compare flow:**
  - Side-by-side: Original vs Proposed (text or media).
  - Adopt: replaces draft field, clears proposed.
  - Reject: discards proposed.

### Options Tab

- **Option list:** Reorderable cards (drag handles).
- **Per-option controls:**
  - Text input with AI rewrite button.
  - "Add Media" → same flow as Stem (library/upload/AI).
- **Bulk actions:** "AI Improve All" → generates rewrites for all options.

### Reference Tab

- **HTML editor:** Monaco or CodeMirror with DOMPurify sanitization.
- **Live preview:** Renders sanitized HTML in iframe.
- **Media region:** Same grid + controls as Stem.
- **Actions:** "AI Rewrite" (converts plain text → formatted HTML).

### New Exercises Tab

- **Form:**
  - Count (1-20), Modes (checkboxes: options, numeric), Difficulty (slider), Topics (tags input).
- **Generate button:** Calls `ai-generate-exercises`.
- **Preview table:** Shows generated items with editable fields.
- **Adopt controls:** "Select All" / "Deselect All", "Adopt Selected" → adds items to chosen group.

---

## UX/Controls

- **Unsaved changes:** Orange badge in navbar + per-item dot in navigator.
- **Breadcrumbs:** Course > Group > Item (click to navigate).
- **Global actions:** Save Draft, Publish (bumps `contentVersion`, invalidates cache), Discard All.
- **Keyboard shortcuts:**
  - `Cmd/Ctrl + S`: Save draft.
  - `Cmd/Ctrl + Right/Left`: Next/prev item.
  - `Cmd/Ctrl + Enter`: Adopt proposed (when compare panel active).
- **Accessibility:**
  - Enforced alt text for all images (form validation).
  - Contrast checker for uploaded images (warning toast if fails WCAG AA).
- **Error handling:**
  - Toast for user-facing errors.
  - Inline errors for form validation.
  - Retry with exponential backoff for AI calls (max 3 attempts).

---

## Security & Validation

- **Admin-only guard:** Route-level auth check; dev override supported via `?role=admin`.
- **HTML sanitization:** DOMPurify with allowlist (no `<script>`, `<iframe>`, event handlers).
- **Media validation:**
  - Mime type whitelist: `image/png`, `image/jpeg`, `image/webp`, `audio/mpeg`, `video/mp4`.
  - Max size: 10 MB images, 25 MB audio/video.
  - Virus scan on upload (optional: integrate ClamAV or AWS S3 bucket scanning).
- **Rate limiting:**
  - AI calls: 100 requests/hour per user (tracked in Redis or Supabase `api_usage` table).
  - Media uploads: 50 MB/hour per user.
- **RLS policies:** Enforce admin role checks on all Supabase tables/functions.

---

## Telemetry

- **Events (Sentry/custom):**
  - `editor.load` (courseId, duration)
  - `editor.save_draft` (courseId, opsCount)
  - `editor.publish` (courseId, contentVersion)
  - `ai.rewrite.request` (segmentType, success/failure)
  - `ai.generate_media.request` (kind, success/failure)
  - `ai.generate_exercises.request` (count, success/failure)
  - `media.search` (query, resultsCount, duration)
  - `media.adopt` (assetId, targetField)

---

## Testing Strategy (TDD)

### Component Tests (Jest + RTL)

1. **CourseEditor shell:**
   - Loads course by `:courseId` via the legacy loader (removed).
   - Renders navbar with breadcrumbs and unsaved badge.
   - Navigator shows groups/items with active state.
2. **StemTab:**
   - Edits stem text; draft updates.
   - Clicks "AI Rewrite"; proposed text appears in compare panel.
   - Adopts proposed; stem text updates.
3. **MediaLibraryPanel:**
   - Searches "clock time"; results render.
   - Selects asset; "Insert Selected" emits event.
4. **ComparePanel:**
   - Displays original vs proposed text.
   - Adopt button updates parent draft state.
5. **OptionsTab:**
   - Adds option; list updates.
   - Reorders options via drag-and-drop (react-beautiful-dnd).
6. **ReferenceTab:**
   - Edits HTML; sanitized preview renders.
   - Generates media via AI; preview in compare panel.
7. **ExercisesTab:**
   - Submits form; loading spinner shows.
   - AI returns items; preview table renders.
   - Adopts 3 items; navigator shows new items in group.

### Unit Tests

1. **patchBuilder:**
   - Generates correct JSON Patch ops for nested paths.
   - Handles array indices (`-` for append).
2. **mediaAdoption:**
   - Moves asset from temp → canonical bucket.
   - Updates course JSON refs.
   - Deletes temp asset.

### Integration Tests

1. **pgvector search:**
   - Inserts 10 media assets with embeddings.
   - Queries with vector; verifies ranked results (similarity > 0.7).
2. **update-course:**
   - Sends patch ops; verifies storage write.
   - Confirms `contentVersion` incremented.

### E2E Tests (Playwright)

1. **Load, edit, save:**
   - Navigate to `/admin/editor/time-grade-1`.
   - Change stem text; click Save Draft.
   - Reload page; verify persisted change.
2. **AI media generate + adopt:**
   - Click "AI Generate Media" in Stem tab.
   - Enter prompt; generate; preview appears.
   - Adopt; media grid shows new asset.
   - Publish; verify course updated in storage.
3. **Semantic search:**
   - Open Media Library panel.
   - Search "analog clock 13:00"; verify results.
   - Insert asset; stem media grid updates.
4. **Generate exercises:**
   - Go to New Exercises tab.
   - Request 5 numeric items; preview renders.
   - Adopt all; navigator shows 5 new items in group.
   - Save draft; reload; items persist.

**Reports:**
- HTML: `reports/playwright-html/`
- JUnit: `reports/playwright-junit.xml`
- Coverage: `reports/coverage/`
- Artifacts (screenshots/traces): `artifacts/`

---

## Implementation Phases

### Phase 1: Foundation (Storage + Search)

- [ ] Enable pgvector extension (migration).
- [ ] Create `media_assets` and `content_embeddings` tables with RLS.
- [ ] Edge Function: `search-media` (semantic search over storage).
- [ ] Edge Function: `search-content` (semantic search over course text).
- [ ] Backfill script: generate embeddings for existing media + courses.

### Phase 2: Editor Shell + Navigator

- [ ] Component test: CourseEditor loads course, renders navbar + breadcrumbs.
- [ ] Create `src/pages/admin/CourseEditor.tsx` with routing.
- [ ] Component test: Navigator renders groups/items, highlights active.
- [ ] Create `src/components/admin/editor/Navigator.tsx`.
- [ ] API client: `src/lib/api/updateCourse.ts`.

### Phase 3: Stem Tab + Compare Panel

- [ ] Component test: StemTab renders text editor, media grid.
- [ ] Create `src/components/admin/editor/StemTab.tsx`.
- [ ] Component test: ComparePanel shows original vs proposed, adopt/reject.
- [ ] Create `src/components/admin/editor/ComparePanel.tsx`.
- [ ] Edge Function: `ai-rewrite-text`.
- [ ] Integration: Wire "AI Rewrite" button → compare panel → adopt.

### Phase 4: Media Library + AI Media

- [ ] Component test: MediaLibraryPanel renders search + grid.
- [ ] Create `src/components/admin/editor/MediaLibraryPanel.tsx`.
- [ ] API client: `src/lib/api/searchMedia.ts`.
- [ ] Edge Function: `ai-generate-media`.
- [ ] Integration: "Select from Library" → insert, "AI Generate" → preview → adopt.

### Phase 5: Options + Reference Tabs

- [ ] Component test: OptionsTab renders option list, per-option controls.
- [ ] Create `src/components/admin/editor/OptionsTab.tsx`.
- [ ] Component test: ReferenceTab renders HTML editor + sanitized preview.
- [ ] Create `src/components/admin/editor/ReferenceTab.tsx` (Monaco + DOMPurify).

### Phase 6: Exercise Generation

- [ ] Component test: ExercisesTab form triggers AI, shows preview, adopts.
- [ ] Create `src/components/admin/editor/ExercisesTab.tsx`.
- [ ] Edge Function: `ai-generate-exercises`.
- [ ] Integration: Adopt flow → adds items to group.

### Phase 7: Save/Publish + E2E

- [ ] Edge Function: `update-course` (JSON Patch application).
- [ ] Unit test: patchBuilder logic.
- [ ] E2E: Load, edit, save, reload, verify persistence.
- [ ] E2E: AI media generate + adopt + publish.
- [ ] E2E: Semantic search → insert asset.
- [ ] E2E: Generate 3 exercises → adopt → save.

### Phase 8: Polish + Docs

- [ ] Telemetry events (Sentry).
- [ ] Accessibility audit (WCAG AA compliance).
- [ ] Update `docs/API_REFERENCE.md` with new endpoints.
- [ ] Update `docs/EDIT_BUTTON_IMPLEMENTATION.md` to link to `/admin/editor/:courseId`.
- [ ] Create tutorial video/GIF for `docs/`.

---

## Dependencies

- **Supabase:**
  - pgvector extension (postgres 14+).
  - Storage buckets: `media/courses`, `media/library`, `media/temp`.
- **AI APIs:**
  - OpenAI (text-embedding-3-small, gpt-4o, DALL-E 3).
  - Optional: ElevenLabs (TTS), Stable Diffusion (images).
- **Frontend:**
  - Monaco Editor or CodeMirror (HTML editing).
  - DOMPurify (HTML sanitization).
  - react-beautiful-dnd (drag-and-drop reorder).
  - jsonpatch (client-side patch generation).
- **Testing:**
  - Jest, React Testing Library, Playwright.

---

## Open Questions

1. **Embedding model:** Use OpenAI `text-embedding-3-small` (1536 dims) or switch to a smaller model (e.g., `text-embedding-ada-002`, 1536 dims)?  
   → **Decision:** Stick with `text-embedding-3-small` for best quality; switch to ada-002 if cost is an issue.

2. **Media backfill:** How to handle ~1000s of existing assets without embeddings?  
   → **Approach:** One-time migration script that processes 100 assets/batch, rate-limited to avoid quota exhaustion.

3. **Conflict resolution:** If two admins edit the same item concurrently, how to handle?  
   → **MVP:** Last-write-wins with `etag` check. Show warning if `etag` mismatch on save (stale data).  
   → **Future:** Operational Transform (OT) or CRDT for real-time collaboration.

4. **Media deduplication:** Store hash of media files to avoid duplicate uploads?  
   → **Yes:** Compute SHA-256 hash on upload; check `media_assets` table before storing. If duplicate, return existing asset.

---

## Success Metrics

- **Adoption:** 80% of course edits use the new editor (vs. manual JSON edits) within 3 months.
- **Efficiency:** Average time to edit a course item reduced by 50% (measured via telemetry).
- **AI usage:** 60% of edits involve at least one AI action (rewrite/generate).
- **Search quality:** 70% of semantic searches return a relevant asset in top 5 results (user survey).
- **Stability:** < 1% error rate on save/publish operations.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| pgvector index slow for large datasets | High latency on search | Use `ivfflat` with tuned `lists` param; consider upgrading to `hnsw` index if available |
| AI API quota exhaustion | Service downtime | Implement client-side rate limiting + queue; show user-friendly error with retry |
| Concurrent edits conflict | Data loss | Implement `etag` checks; show diff UI for conflict resolution |
| Media storage costs spike | Budget overrun | Auto-delete temp media after 24h; compress images on upload; archive unused assets |

---

## Future Enhancements

- **Real-time collaboration:** WebSocket sync for multi-admin editing (OT/CRDT).
- **Version history:** Store snapshots of each `contentVersion` with rollback UI.
- **Batch operations:** "Apply AI rewrite to all items in group" with bulk preview.
- **Advanced search:** Combine semantic + metadata filters (e.g., "clock images uploaded by me in last 30 days").
- **Custom AI models:** Fine-tune smaller embedding model on course-specific corpus for faster/cheaper search.

---

## References

- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [JSON Patch RFC 6902](https://tools.ietf.org/html/rfc6902)
- [DOMPurify](https://github.com/cure53/DOMPurify)
- [React Beautiful DnD](https://github.com/atlassian/react-beautiful-dnd)

---

**End of Plan**
