# Catalog Update Architecture - Solid Solution

## **Problem Statement**

**Current Issues:**
1. ❌ Courses generate successfully but don't appear in catalog
2. ❌ CDN caching prevents fresh catalog reads
3. ❌ Timestamp cache-busting doesn't work reliably
4. ❌ Realtime subscription exists but doesn't trigger catalog refresh
5. ❌ Users must manually refresh browser to see new courses

**Root Cause:** Fragmented catalog update logic across multiple components

---

## **Solid Architecture**

### **Single Source of Truth: ai-job-runner**

When a course completes, `ai-job-runner` MUST:

```typescript
// supabase/functions/ai-job-runner/index.ts

1. ✅ Generate course JSON
2. ✅ Upload to Storage: courses/{courseId}/course.json
3. ✅ Update catalog.json in Storage
4. ✅ Insert catalog_updates table record  // NEW
5. ✅ Broadcast realtime event  // NEW
6. ✅ Mark job as 'done'
```

---

## **New Table: catalog_updates**

```sql
create table public.catalog_updates (
  id uuid primary key default gen_random_uuid(),
  course_id text not null,
  action text not null check (action in ('added', 'updated', 'deleted')),
  catalog_version integer not null,
  updated_at timestamptz default now()
);

alter table public.catalog_updates enable row level security;

create policy "Anyone can view catalog updates"
  on public.catalog_updates for select
  using (true);

-- Enable realtime
alter publication supabase_realtime add table public.catalog_updates;

-- Auto-increment version
create sequence if not exists catalog_version_seq;

create or replace function public.get_next_catalog_version()
returns integer
language sql
as $$
  select nextval('catalog_version_seq')::integer;
$$;
```

**Why:** Reliable event stream for UI to listen to

---

## **Updated ai-job-runner Logic**

```typescript
// After successful course generation

// 1. Upload course JSON (already done)
const coursePath = `${courseId}/course.json`;
await uploadCourseJSON(course, coursePath);

// 2. Update catalog
const catalogVersion = await updateCatalogInStorage(courseId, course);

// 3. Insert catalog_updates record (triggers realtime)
await supabase
  .from('catalog_updates')
  .insert({
    course_id: courseId,
    action: 'added',
    catalog_version: catalogVersion,
  });

// 4. Mark job as done
await supabase
  .from('ai_course_jobs')
  .update({ status: 'done', result_path: coursePath })
  .eq('id', jobId);

// Realtime fires automatically → UI refreshes
```

---

## **Frontend: Courses.tsx**

```typescript
// Subscribe to catalog_updates table (not ai_course_jobs)

useEffect(() => {
  const channel = supabase
    .channel('catalog-updates')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'catalog_updates',
    }, async (payload) => {
      const update = payload.new;
      
      console.log('📢 Catalog updated:', update);
      
      // Clear ALL caches
      localStorage.removeItem('course-catalog-cache');
      sessionStorage.clear();
      
      // Force fresh fetch with version
      const fresh = await fetch(`/storage/v1/object/public/courses/catalog.json?v=${update.catalog_version}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      
      const newCatalog = await fresh.json();
      setCatalog(newCatalog);
      
      // Toast notification
      const course = newCatalog.courses.find(c => c.id === update.course_id);
      if (course) {
        toast.success(`New course available: ${course.title}`);
      }
    })
    .subscribe();

  return () => channel.unsubscribe();
}, []);
```

**Why:** Listen to the right table, force fresh fetch with version

---

## **Catalog Update Function in ai-job-runner**

```typescript
async function updateCatalogInStorage(
  courseId: string,
  course: Course,
  supabase: any
): Promise<number> {
  // 1. Get current catalog
  const { data: catalogFile } = await supabase.storage
    .from('courses')
    .download('catalog.json');
  
  const catalogText = await catalogFile.text();
  const catalog = JSON.parse(catalogText);
  
  // 2. Add/update course entry
  const existingIndex = catalog.courses.findIndex(c => c.id === courseId);
  const courseEntry = {
    id: courseId,
    title: course.title,
    description: course.description || '',
    grade: course.grade || 'All Grades',
    itemCount: course.items.length,
    hasStudyTexts: !!course.studyTexts && course.studyTexts.length > 0,
    contentVersion: course.contentVersion || 'v1',
    updatedAt: new Date().toISOString(),
  };
  
  if (existingIndex >= 0) {
    catalog.courses[existingIndex] = courseEntry;
  } else {
    catalog.courses.push(courseEntry);
  }
  
  // 3. Get next version
  const { data: versionData } = await supabase.rpc('get_next_catalog_version');
  const newVersion = versionData || 1;
  
  catalog.version = newVersion;
  catalog.lastUpdated = new Date().toISOString();
  
  // 4. Upload new catalog
  const catalogBlob = new Blob([JSON.stringify(catalog, null, 2)], {
    type: 'application/json',
  });
  
  await supabase.storage
    .from('courses')
    .upload('catalog.json', catalogBlob, {
      upsert: true,
      contentType: 'application/json',
      cacheControl: 'no-cache, no-store, must-revalidate',  // Force fresh
    });
  
  return newVersion;
}
```

**Why:** Atomic catalog updates with version tracking

---

## **Cache Strategy**

### **Catalog (catalog.json)**
```
Cache-Control: no-cache, no-store, must-revalidate
```
**Why:** Always fetch fresh (small file, changes frequently)

### **Courses (course.json)**
```
Cache-Control: public, max-age=3600
```
**Why:** Larger files, change less often, versioned via contentVersion

### **Images**
```
Cache-Control: public, max-age=31536000, immutable
```
**Why:** Never change once uploaded (versioned filenames)

---

## **Implementation Checklist**

### **Database Migration**
- [ ] Create `catalog_updates` table
- [ ] Create `catalog_version_seq` sequence
- [ ] Create `get_next_catalog_version()` function
- [ ] Enable realtime on `catalog_updates`

### **Backend (ai-job-runner)**
- [ ] Add `updateCatalogInStorage()` function
- [ ] Insert `catalog_updates` record after catalog update
- [ ] Ensure atomic operation (transaction)

### **Frontend (Courses.tsx)**
- [ ] Subscribe to `catalog_updates` table (not `ai_course_jobs`)
- [ ] Force fresh fetch on update event
- [ ] Clear localStorage cache
- [ ] Show toast notification

### **Testing**
- [ ] Generate course → Verify appears in catalog immediately
- [ ] No manual refresh needed
- [ ] Toast notification appears
- [ ] Course clickable and loads

---

## **Why This Works**

✅ **Single Update Point** - Only ai-job-runner touches catalog  
✅ **Reliable Events** - Database table, not edge function  
✅ **Version Tracking** - Sequential versions prevent race conditions  
✅ **Forced Fresh Fetch** - Version parameter bypasses CDN  
✅ **Clear Feedback** - Toast shows exactly what was added  

---

## **Estimated Implementation Time**

- Migration: 15 minutes
- Backend: 30 minutes
- Frontend: 15 minutes
- Testing: 15 minutes
**Total: 75 minutes**

---

**This is a SOLID solution that will work reliably.**

Approve to proceed with implementation?

