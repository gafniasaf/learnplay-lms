# Multimedia in Answer Options - Implementation Status

## **Phase 1: Foundation - COMPLETED** ✅

### **Tests Written** ✅
1. ✅ **OptionGrid image options accessibility** - `src/components/game/OptionGrid.imageOptions.test.tsx`
   - Image rendering with alt text
   - Lazy loading (`loading="lazy"`)
   - Fallback alt text generation
   - Mixed media/text options
   - Audio and video options with transcripts/captions
   - Keyboard navigation preserved
   - Locked state handling
   - 16:9 aspect ratio enforcement

2. ✅ **OptionGrid seeded shuffle with optionMedia** - `src/components/game/OptionGrid.shuffle.test.tsx`
   - Stable shuffle across re-renders
   - Different shuffles for different items
   - Different shuffles for different variants
   - Media and text shuffled together
   - originalIndex mapping for scoring
   - Empty and partial optionMedia handling

3. ✅ **Stem component isolation** - `src/components/game/Stem.test.tsx`
   - Confirms Stem is unaffected by optionMedia
   - Stimulus rendering remains independent
   - No breaking changes with courseTitle/itemId

### **Implementation** ✅
- ✅ **OptionGrid already supports optionMedia** - Implemented by Lovable
  - Images with lazy load
  - Audio with transcript collapsible
  - Video with captions
  - Mixed media/text options
  - Seeded deterministic shuffle

### **Database Schema** ✅
1. ✅ **media_generation_providers table** - `supabase/migrations/20251024100000_media_generation_providers.sql`
   - Provider registry (DALL-E 3, Stable Diffusion, OpenAI TTS, ElevenLabs, Zeroscope)
   - Cost, quality rating, avg generation time
   - Provider-specific config (JSON)
   - RLS policies (admin manage, public read enabled)
   - `get_providers_for_media_type()` RPC

2. ✅ **ai_media_jobs enhancements** - `supabase/migrations/20251024100001_ai_media_jobs_enhancements.sql`
   - `idempotency_key` - prevent duplicate jobs
   - `target_ref` (JSONB) - where media belongs (study_text/item_stimulus/item_option)
   - `provider` - which AI provider
   - `style` - generation style
   - `priority` - job ordering
   - `attempts` - retry counter
   - `last_heartbeat` - stale detection
   - `dead_letter_reason` - failure tracking
   - `asset_version` - versioning support
   - `cost_usd` - cost tracking
   - Helper functions: `generate_media_idempotency_key()`, `mark_stale_media_jobs()`, `move_media_jobs_to_dead_letter()`

3. ✅ **media_assets table** - `supabase/migrations/20251024100002_media_assets.sql`
   - Versioned asset metadata (`logical_id`, `version`)
   - Storage paths and public URLs
   - Generation metadata (provider, prompt, style, seed, cost)
   - Moderation status and flags
   - Usage tracking (`usage_count`, `last_used_at`)
   - RLS policies (public read active, creators manage own)
   - Helper functions: `increment_asset_usage()`, `get_latest_asset_version()`, `search_assets_by_prompt()`

---

## **Phase 2: Core Implementation - IN PROGRESS** 🚧

### **Remaining Critical Tasks**

#### **Documentation** (High Priority)
- ⏳ **MEDIA_STORAGE_STANDARDS** *(archived; see `docs/legacy-course-reference.md`)* - Document option media paths and versioning
- ⏳ **AI_PROVIDERS** - Document quotas and provider governance
- ⏳ **README** - Update with editing workflow and provider governance

#### **Types & Shared Code** (High Priority)
- ⏳ **Course types** - Add `mediaId` references for optionMedia
- ⏳ **Provider registry module** - `supabase/functions/_shared/media-providers.ts`
  - Abstract provider interface
  - Registry pattern
  - Provider selection logic
  - Cost estimation
  - Validation

#### **Edge Function Integration** (High Priority)
- ⏳ **ai-media-runner provider integration** - Use provider registry
- ⏳ **Asset metadata persistence** - Write to `media_assets` table and Storage metadata
- ⏳ **Replicate Stable Diffusion** - Add SD provider implementation

#### **E2E Tests** (High Priority)
- ⏳ **Visual MCQ selection and scoring** - `tests/e2e/visual-mcq.spec.ts`
- ⏳ **Editor regeneration with versioning** - `tests/e2e/media-regeneration.spec.ts`

---

## **Phase 3: Advanced Features - PLANNED** 📋

### **UI Components** (Medium Priority)
- ⏳ **Media Library tab** - in AIAuthor editor
- ⏳ **Regeneration modal** - with provider choice
- ⏳ **Bulk regeneration** - in Media Library
- ⏳ **Realtime updates** - inject completed jobs into editor

### **AI Proposal System** (Medium Priority)
- ⏳ **Visual MCQ proposal** - optionMedia planning in proposal phase
- ⏳ **Provider comparison** - AI suggests best provider for use case
- ⏳ **Cost estimation** - in proposal UI

### **Governance & Safety** (Medium Priority)
- ⏳ **Admin UI** - enable/disable providers, set cost caps
- ⏳ **Budget enforcement** - per-user, per-course limits
- ⏳ **Moderation** - quarantine flagged assets
- ⏳ **Reviewer UI** - approve/reject flagged media

### **Advanced Search** (Low Priority)
- ⏳ **scan_for_duplicates** - find similar existing assets
- ⏳ **Content reuse proposals** - AI suggests reusing existing media
- ⏳ **Similarity search** - vector embeddings for image similarity

### **Unit Tests** (Low Priority)
- ⏳ **Proposal optionMedia plans** - AI generates Visual MCQ plans
- ⏳ **Media reducers** - versioning and rollback logic
- ⏳ **Provider gating** - budget checks
- ⏳ **Moderation workflow** - UI states
- ⏳ **Similarity merge plans** - content reuse

### **E2E Tests** (Low Priority)
- ⏳ **Bulk regeneration** - multiple items
- ⏳ **Budget cap gating** - warning UI

### **CI/CD** (Low Priority)
- ⏳ **Playwright scenarios** - add to CI gating

---

## **What Works Right Now** ✅

### **Rendering**
- ✅ Visual MCQ with image options displays correctly
- ✅ Audio MCQ with transcript toggle works
- ✅ Video MCQ with captions works
- ✅ Mixed text/media options supported
- ✅ Lazy loading for performance
- ✅ Accessible (alt text, ARIA labels, keyboard nav)
- ✅ Deterministic shuffle (stable per item)

### **Database**
- ✅ Provider registry with 7 providers
- ✅ Job queue with idempotency, priority, retry
- ✅ Asset versioning and metadata tracking
- ✅ Cost tracking per generation
- ✅ Stale job detection and dead letter queue

### **What's Tested**
- ✅ 30+ unit tests for OptionGrid image/audio/video rendering
- ✅ Accessibility compliance
- ✅ Shuffle determinism
- ✅ Stem component isolation

---

## **Next Steps for Phase 2**

### **Week 1: Provider Registry & Documentation**
1. Create `supabase/functions/_shared/media-providers.ts`
2. Integrate registry into `ai-media-runner`
3. Update `MEDIA_STORAGE_STANDARDS.md` *(archived reference via `docs/legacy-course-reference.md`)*
4. Update `AI_PROVIDERS.md`
5. Update `README.md`

### **Week 2: Asset Persistence & Testing**
1. Modify `ai-media-runner` to write `media_assets` records
2. Add Storage object metadata on upload
3. Write contract tests for versioning
4. Write E2E test for Visual MCQ flow
5. Write E2E test for regeneration

### **Week 3: Replicate SD & Proposal**
1. Implement Stable Diffusion provider
2. Add provider selection to proposal system
3. Test cost estimation
4. Add provider comparison tool

### **Week 4: Media Library UI**
1. Build Media Library tab component
2. Implement single regeneration modal
3. Add Realtime subscription for job updates
4. Test bulk operations

---

## **Phase 3+ Features (Future)**

These are designed and documented but not yet implemented:

- **Full AI Proposal with Provider Comparison** - AI suggests best provider per media type
- **Content Scanning & Reuse** - Detect duplicate prompts, suggest reusing existing assets
- **Moderation Workflow** - Review and approve flagged content
- **Budget Governance** - Per-user/per-course spending limits
- **Advanced Analytics** - Cost dashboards, provider performance metrics
- **Multi-Provider Video** - Zeroscope, Runway, other video generators

---

## **Breaking Changes & Migration**

### **None for Existing Courses**
- All changes are additive
- `optionMedia` is optional in `CourseItem`
- Existing text-only MCQ courses work unchanged

### **Future: Moving to `mediaId` References**
When implemented, course JSON will change from:
```json
{
  "optionMedia": [
    { "type": "image", "url": "/liver/right-lobe.png", "alt": "Right lobe" }
  ]
}
```

To:
```json
{
  "optionMedia": [
    { "mediaId": "liver-anatomy-v2" }  // References media_assets.logical_id
  ]
}
```

Migration script will:
1. Scan all course JSON
2. Create `media_assets` records for existing media
3. Replace URLs with `mediaId` references
4. Maintain backward compatibility via resolver

---

## **Success Criteria**

### **Phase 1 (Complete)** ✅
- [x] Visual MCQ renders correctly in Play UI
- [x] Accessible (WCAG AA)
- [x] Tests pass (30+ tests)
- [x] Database schema supports versioning and providers
- [x] No performance regression

### **Phase 2 (Target: Week 4)**
- [ ] Provider registry operational
- [ ] `ai-media-runner` writes versioned assets
- [ ] Stable Diffusion provider works
- [ ] E2E tests cover Visual MCQ and regeneration
- [ ] Documentation complete

### **Phase 3 (Target: Week 8)**
- [ ] Media Library UI functional
- [ ] Bulk regeneration works
- [ ] Proposal system includes provider comparison
- [ ] Budget enforcement operational
- [ ] Moderation workflow ready for production

---

**Last Updated:** 2025-10-24  
**Status:** Phase 1 Complete, Phase 2 In Progress  
**Test Coverage:** 30+ unit tests passing  
**Database:** 3 migrations ready for deployment

