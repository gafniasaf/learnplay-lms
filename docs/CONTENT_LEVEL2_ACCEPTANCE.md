# Level 2 Content - Acceptance Criteria

## Overview
This document defines the acceptance criteria for Level 2 content additions to the verbs and modals courses.

## Changes Made

### 1. Content Version Update
- **verbs**: `1.0.0` → `1.1.0`
- **modals**: `1.0.0` → `1.1.0`

### 2. Blank Placeholder Update
- Changed all `_` to `[blank]` in item text
- **Example:**
  - Before: `"She ___ to school every day."`
  - After: `"She [blank] to school every day."`

### 3. Variant Format Update
- Changed all variant from `"a"` to `"1"`
- Aligns with schema requirement: `variant: z.enum(["1", "2", "3"])`

### 4. Level 2 Structure
Both courses already have Level 2 defined with 12 items:

**Verbs Course:**
- Level 1: Groups 1-6 (items 1-12) - Basic Tenses
- Level 2: Groups 7-12 (items 13-24) - Complex Tenses
  - Group 7: Present Perfect (items 13-14)
  - Group 8: Present Perfect Continuous (items 15-16)
  - Group 9: Past Perfect (items 17-18)
  - Group 10: Past Perfect Continuous (items 19-20)
  - Group 11: Future Perfect (items 21-22)
  - Group 12: Future Perfect Continuous (items 23-24)

**Modals Course:**
- Level 1: Groups 1-6 (items 1-12) - Foundation
- Level 2: Groups 7-12 (items 13-24) - Intermediate
  - Group 7: Past Ability (items 13-14)
  - Group 8: Past Obligation (items 15-16)
  - Group 9: Conditional (items 17-18)
  - Group 10: Polite Requests (items 19-20)
  - Group 11: Speculation (items 21-22)
  - Group 12: Strong Deduction (items 23-24)

## Course Contract Validation

### Schema Requirements
The following schema validations must pass:

```typescript
const CourseItemSchema = z.object({
  id: z.number(),
  groupId: z.union([z.number(), z.string()]),
  text: z.string(),
  options: z.array(z.string()).min(3).max(4),
  correctIndex: z.number().int(),
  explain: z.string().min(3),
  clusterId: z.string().optional(),
  variant: z.enum(["1", "2", "3"]).optional(),
});

const CourseSchema = z.object({
  id: z.string(),
  title: z.string(),
  contentVersion: z.string(),
  levels: z.array(
    z.object({
      id: z.number(),
      start: z.number(),
      end: z.number(),
      title: z.string(),
    })
  ),
  groups: z.array(
    z.object({
      id: z.union([z.number(), z.string()]),
      name: z.string(),
    })
  ),
  items: z.array(CourseItemSchema),
});
```

### Validation Checklist
✅ All items have valid `id` (number)  
✅ All items have valid `groupId` (number or string)  
✅ All items have `text` with `[blank]` placeholder  
✅ All items have `options` array (3-4 items)  
✅ All items have valid `correctIndex` (0-3)  
✅ All items have `explain` (min 3 characters)  
✅ All items have `clusterId` (optional string)  
✅ All items have `variant` as "1", "2", or "3" (optional)  
✅ Course has valid `levels` array with Level 2  
✅ Course has valid `groups` array (12 groups)  
✅ Course has valid `items` array (24 items)  

## Level Selector

### Expected Behavior
1. Navigate to `/courses` page
2. Select either "Verbs" or "English Modals" course
3. Click "Play" button
4. Level selector should show:
   - **Level 1** - Basic Tenses / Foundation (Groups 1-6)
   - **Level 2** - Complex Tenses / Intermediate (Groups 7-12)
5. Selecting Level 2 should load groups 7-12
6. Items should display with `[blank]` placeholder

### UI Elements
- Level dropdown/selector shows both levels
- Level 2 title displayed correctly
- Group names for Level 2 displayed correctly
- Items use `[blank]` in text display

## Rotation System

### Cluster Structure
- Each item has a unique `clusterId`
- Items with same `clusterId` are variants
- `variant` field indicates rotation: "1", "2", or "3"
- Currently all items are variant "1"

### Rotation Logic
The rotation system works as follows:
1. Items with matching `clusterId` form a cluster
2. When a cluster is encountered, one variant is selected
3. Variants rotate through "1" → "2" → "3"
4. If additional variants are added later, they will rotate automatically

### Current Implementation
- All 24 items have variant "1"
- Each item has a unique clusterId (no rotation yet)
- Framework supports rotation when variants "2" and "3" are added

### Future Enhancement
To enable full rotation:
1. Create variant "2" and "3" for each cluster
2. Same `clusterId`, different `variant` ("1", "2", "3")
3. Different text and options, but same concept
4. Game logic automatically rotates through variants

## Upload Process

### Using Course Author
1. Navigate to `/admin/courses/author`
2. Sign in as admin
3. Copy the JSON content for verbs or modals
4. Paste into the Course Author textarea
5. Validation runs automatically
6. Click "Upload Course" button
7. Verify success message

### Validation During Upload
- Client-side validation using Zod schema
- Server-side validation in edge function
- Content sanitization applied
- Upload to Storage bucket

### Storage Path
- Verbs: `courses/verbs/course.json`
- Modals: `courses/modals/course.json`

## Testing Checklist

### Pre-Upload Testing
- [ ] JSON validates in Course Author
- [ ] No syntax errors
- [ ] All required fields present
- [ ] Variant values are "1", "2", or "3"
- [ ] Content version updated

### Post-Upload Testing
- [ ] Course appears in course list
- [ ] Level selector shows Level 2
- [ ] Level 2 title displays correctly
- [ ] Can navigate to Level 2
- [ ] Items display with [blank] placeholder
- [ ] Items load correctly (no errors)
- [ ] Options display correctly
- [ ] Correct answer works
- [ ] Explanations display
- [ ] Can complete Level 2 rounds

### Rotation Testing
- [ ] Items have clusterId
- [ ] Items have variant "1"
- [ ] Game accepts variant field
- [ ] No rotation errors (only 1 variant exists)
- [ ] Future rotation ready (when variants 2-3 added)

## Course Content Summary

### Verbs - Level 2 (Complex Tenses)
**12 items covering:**
1. Present Perfect (2 items)
2. Present Perfect Continuous (2 items)
3. Past Perfect (2 items)
4. Past Perfect Continuous (2 items)
5. Future Perfect (2 items)
6. Future Perfect Continuous (2 items)

**Key Concepts:**
- Connection between past and present
- Duration emphasis with continuous forms
- Sequence of past events
- Completion before future time
- Continuous action up to future point

### Modals - Level 2 (Intermediate)
**12 items covering:**
1. Past Ability (2 items)
2. Past Obligation (2 items)
3. Conditional (2 items)
4. Polite Requests (2 items)
5. Speculation (2 items)
6. Strong Deduction (2 items)

**Key Concepts:**
- Past modal constructions
- Hypothetical situations
- Formal politeness
- Uncertainty about past events
- Logical conclusions about past

## Success Criteria

### Must Have
✅ Both courses updated with [blank] placeholders  
✅ All variants changed to "1"  
✅ Content version bumped to 1.1.0  
✅ Level 2 defined with 12 items  
✅ Course Contract Validation passes  
✅ Level selector shows Level 2  
✅ Can play Level 2 without errors  

### Should Have
✅ Clear group names for Level 2 content  
✅ Helpful explanations for each item  
✅ Appropriate difficulty progression  
✅ Consistent formatting across items  

### Nice to Have
⏳ Multiple variants (2 and 3) for rotation  
⏳ Additional items for more practice  
⏳ Audio pronunciations  
⏳ Visual aids  

## Known Limitations

1. **Single Variant**: Currently all items are variant "1". Full rotation requires creating variants "2" and "3".

2. **No Variant Rotation**: Since only one variant exists per cluster, rotation doesn't occur yet. This is by design for initial release.

3. **Fixed Group Structure**: Each group has exactly 2 items. Future versions could expand this.

## Next Steps

1. **Upload to Course Author:**
   - Copy JSON from updated files
   - Validate in Course Author
   - Upload both courses

2. **Test Level 2:**
   - Play through Level 2 for both courses
   - Verify all items work correctly
   - Check explanations display

3. **Future Content:**
   - Create variants "2" and "3" for rotation
   - Add more items if needed
   - Consider Level 3 content

## Files Modified

- `public/mock/courses/verbs.json` - Updated with [blank] and variant "1"
- `public/mock/courses/modals.json` - Updated with [blank] and variant "1"
- `docs/CONTENT_LEVEL2_ACCEPTANCE.md` - This documentation

## References

- Course Author Page: `/admin/courses/author`
- Course Contract Test: `src/lib/tests/courseContract.test.ts`
- Rotation Test: `src/lib/tests/rotation.test.ts`
- Schema Definition: `src/pages/admin/CourseAuthor.tsx`
