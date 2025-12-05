# Upload New Courses Guide

## Courses Ready to Upload

Three new courses have been prepared in `public/courses-to-upload/`:

1. **Multiplication** (`multiplication.json`)
   - 36 items across 12 groups (2× through 12× tables)
   - 5 levels from easy (2×, 5×, 10×) to mixed review
   - Numeric mode for direct answer input
   - Elementary math focus

2. **Science** (`science.json`)
   - 30 items across 10 groups
   - Topics: living/non-living, food chains, plants, animals, matter, energy, water cycle
   - 4 levels covering life science, physical science, earth science
   - Multiple choice questions

3. **History** (`history.json`)
   - 30 items across 10 groups
   - US History from Colonial America through Civil Rights
   - 4 levels covering different historical eras
   - Multiple choice questions

## How to Upload

### Method 1: Via CourseAuthor UI (Recommended)

1. **Navigate to CourseAuthor:**
   - Go to `/admin/course-author` in your browser
   - Or use the Admin menu if you're logged in as an admin

2. **Upload Each Course:**
   - Click on the **Upload** tab
   - Copy the contents of one course JSON file (e.g., `public/courses-to-upload/multiplication.json`)
   - Paste into the JSON editor
   - Wait for validation (green checkmark should appear)
   - Click **Upload Course**
   - Repeat for the other two courses

3. **Verify Upload:**
   - Go to `/courses` to see the updated catalog
   - Each course should show correct:
     - Item count (36 for multiplication, 30 for science/history)
     - Group count (12 for multiplication, 10 for science/history)
   - Test playability by clicking "Play" on each course

### Method 2: Direct Storage Upload (Admin)

If you have admin access to Supabase Storage:

1. Open Supabase dashboard
2. Navigate to Storage → courses bucket
3. Create folders: `multiplication/`, `science/`, `history/`
4. Upload each JSON file as `course.json` in its respective folder
5. Update catalog manually or use the `update-catalog` edge function

## Expected Catalog Entries

After upload, the catalog should show:

```json
{
  "id": "multiplication",
  "title": "Multiplication Facts",
  "subject": "math-multiplication",
  "gradeBand": "Grades 2-5",
  "contentVersion": "1",
  "itemCount": 36,
  "groupCount": 12,
  "difficulty": "Elementary"
}
```

```json
{
  "id": "science",
  "title": "Elementary Science",
  "subject": "science-elementary",
  "gradeBand": "Grades 3-5",
  "contentVersion": "1",
  "itemCount": 30,
  "groupCount": 10,
  "difficulty": "Elementary"
}
```

```json
{
  "id": "history",
  "title": "US History",
  "subject": "history-us",
  "gradeBand": "Grades 4-6",
  "contentVersion": "1",
  "itemCount": 30,
  "groupCount": 10,
  "difficulty": "Intermediate"
}
```

## Testing Playability

After upload, test each course:

1. **Multiplication:**
   - `/play/multiplication?level=1` (Easy tables)
   - Try entering numeric answers
   - Verify adaptive rotation works

2. **Science:**
   - `/play/science?level=1` (Life Science)
   - Check multiple choice options display correctly
   - Verify explanations show after answers

3. **History:**
   - `/play/history?level=1` (Colonial & Revolutionary)
   - Test navigation through levels
   - Verify progress tracking

## Contract Validation

Run the course contract test to ensure compliance:

```typescript
// In /dev/tests page
import { runCourseContractTest } from '@/lib/tests/courseContract.test';

const result = await runCourseContractTest();
console.log(result);
```

This will validate all courses against the Course v2 schema.

## Course Design Features

All three courses follow best practices:

✅ **Cluster Triplets**: Each concept has 3 variants for rotation
✅ **Progressive Levels**: Difficulty increases across levels
✅ **Group Organization**: Related items grouped logically
✅ **Clear Explanations**: Every item has helpful feedback
✅ **Adaptive-Ready**: Designed for the adaptive rotation system

## Troubleshooting

### Validation Errors

If you see validation errors:
- Check that all items have required fields
- Verify `correctIndex` is within options array bounds
- Ensure numeric mode items have `answer` field
- Confirm all IDs are unique

### Upload Fails

If upload fails:
- Check admin authentication
- Verify file is valid JSON
- Ensure courseId is unique
- Check Storage bucket permissions

### Courses Not in Catalog

If courses don't appear:
- Clear catalog cache: `localStorage.removeItem('catalogJson')`
- Refresh the `/courses` page
- Check browser console for errors
- Verify catalog.json was updated

## Next Steps

After successful upload:

1. **Add to Navigation**: Update `src/config/nav.ts` if needed
2. **Create Assignments**: Teachers can assign these courses to students
3. **Monitor Analytics**: Check event logs for usage patterns
4. **Gather Feedback**: Use student performance data to refine content
