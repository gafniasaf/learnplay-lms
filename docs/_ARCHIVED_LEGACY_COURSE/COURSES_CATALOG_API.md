# Courses Catalog API

## Overview

The Courses Catalog API provides paginated, filtered, and sorted access to available courses with support for tag filtering and search.

---

## List Courses API

### Endpoint
```
GET /functions/v1/list-courses
```

### Description
Returns a paginated list of courses with optional filtering and sorting.

### Authentication
Optional. Authenticated users can see their organization's courses plus global courses. Unauthenticated users only see global courses.

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| page | number | No | 1 | Page number (1-indexed) |
| limit | number | No | 20 | Items per page (1-100) |
| tags | string | No | - | Comma-separated tag slugs to filter by |
| sort | string | No | newest | Sort order: `title_asc`, `title_desc`, `newest`, `oldest` |
| search | string | No | - | Search term to filter course IDs |

### Sort Options

- **title_asc**: Sort by course ID alphabetically (A-Z)
- **title_desc**: Sort by course ID reverse alphabetically (Z-A)
- **newest**: Sort by creation date, newest first (default)
- **oldest**: Sort by creation date, oldest first

### Response Schema

```typescript
{
  items: Array<{
    id: string;
    title: string;
    description: string;
    grade: string | null;
    subject: string | null;
    itemCount: number;
    tags: Record<string, any>;
    tagIds: string[];
    visibility: 'global' | 'org';
    organizationId: string;
    contentVersion: number;
    createdAt: string;
    updatedAt: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

### Sample Response

```json
{
  "items": [
    {
      "id": "math_grade4_fractions",
      "title": "Grade 4 Math: Fractions",
      "description": "Learn about fractions with engaging exercises",
      "grade": "4",
      "subject": "math",
      "itemCount": 45,
      "tags": {
        "subject": "math",
        "grade": "4",
        "difficulty": "intermediate"
      },
      "tagIds": ["tag-uuid-1", "tag-uuid-2"],
      "visibility": "global",
      "organizationId": "org-uuid",
      "contentVersion": 1,
      "createdAt": "2025-01-15T10:00:00Z",
      "updatedAt": "2025-01-20T14:30:00Z"
    },
    {
      "id": "science_grade5_cells",
      "title": "Grade 5 Science: Cell Biology",
      "description": "Explore the fascinating world of cells",
      "grade": "5",
      "subject": "science",
      "itemCount": 38,
      "tags": {
        "subject": "science",
        "grade": "5",
        "difficulty": "advanced"
      },
      "tagIds": ["tag-uuid-3", "tag-uuid-4"],
"visibility": "global",
      "organizationId": "org-uuid",
      "contentVersion": 2,
      "createdAt": "2025-01-10T09:00:00Z",
      "updatedAt": "2025-01-25T11:15:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20,
  "totalPages": 3
}
```

### Empty Response

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "totalPages": 0
}
```

---

## Examples

### cURL Examples

#### Basic request (first page, default sort)
```bash
curl -X GET "https://grffepyrmjihphldyfha.supabase.co/functions/v1/list-courses"
```

#### With pagination
```bash
curl -X GET "https://grffepyrmjihphldyfha.supabase.co/functions/v1/list-courses?page=2&limit=10"
```

#### Filter by tags
```bash
curl -X GET "https://grffepyrmjihphldyfha.supabase.co/functions/v1/list-courses?tags=math,grade-4"
```

#### Sort by title
```bash
curl -X GET "https://grffepyrmjihphldyfha.supabase.co/functions/v1/list-courses?sort=title_asc"
```

#### Search with filters
```bash
curl -X GET "https://grffepyrmjihphldyfha.supabase.co/functions/v1/list-courses?search=fractions&tags=math&sort=newest&page=1&limit=20"
```

#### Authenticated request
```bash
curl -X GET "https://grffepyrmjihphldyfha.supabase.co/functions/v1/list-courses?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### JavaScript Example

```javascript
import { supabase } from '@/integrations/supabase/client';

async function listCourses(options = {}) {
  const {
    page = 1,
    limit = 20,
    tags = [],
    sort = 'newest',
    search = null
  } = options;

  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    sort
  });

  if (tags.length > 0) {
    params.append('tags', tags.join(','));
  }

  if (search) {
    params.append('search', search);
  }

  const { data, error } = await supabase.functions.invoke(
    `list-courses?${params.toString()}`,
    { method: 'GET' }
  );

  if (error) {
    console.error('Error fetching courses:', error);
    return null;
  }

  return data;
}

// Usage examples
const allCourses = await listCourses();
const mathCourses = await listCourses({ tags: ['math'], sort: 'title_asc' });
const searchResults = await listCourses({ search: 'fraction', page: 1 });
```

### React Hook Example

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface CourseListOptions {
  page?: number;
  limit?: number;
  tags?: string[];
  sort?: 'title_asc' | 'title_desc' | 'newest' | 'oldest';
  search?: string | null;
}

function useCourseList(options: CourseListOptions = {}) {
  return useQuery({
    queryKey: ['courses', options],
    queryFn: async () => {
      const {
        page = 1,
        limit = 20,
        tags = [],
        sort = 'newest',
        search = null
      } = options;

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sort
      });

      if (tags.length > 0) {
        params.append('tags', tags.join(','));
      }

      if (search) {
        params.append('search', search);
      }

      const { data, error } = await supabase.functions.invoke(
        `list-courses?${params.toString()}`,
        { method: 'GET' }
      );

      if (error) throw error;
      return data;
    }
  });
}

// Component usage
function CourseList() {
  const [page, setPage] = useState(1);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'newest' | 'title_asc'>('newest');
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, error } = useCourseList({
    page,
    limit: 20,
    tags: selectedTags,
    sort: sortBy,
    search: searchTerm || null
  });

  if (isLoading) return <div>Loading courses...</div>;
  if (error) return <div>Error loading courses</div>;

  return (
    <div>
      <h2>Courses ({data.total})</h2>
      
      {/* Filters */}
      <div className="filters">
        <input
          type="text"
          placeholder="Search courses..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="title_asc">Title A-Z</option>
          <option value="title_desc">Title Z-A</option>
        </select>
      </div>

      {/* Course List */}
      <div className="course-grid">
        {data.items.map(course => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>

      {/* Pagination */}
      <div className="pagination">
        <button
          disabled={page === 1}
          onClick={() => setPage(p => p - 1)}
        >
          Previous
        </button>
        <span>Page {page} of {data.totalPages}</span>
        <button
          disabled={page >= data.totalPages}
          onClick={() => setPage(p => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

---

## Database Schema

### course_metadata Table

```sql
CREATE TABLE public.course_metadata (
  id text PRIMARY KEY,
  organization_id uuid NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('org', 'global')) DEFAULT 'org',
  tags jsonb DEFAULT '{}',
  tag_ids uuid[] DEFAULT '{}',
  content_version integer NOT NULL DEFAULT 1,
  etag integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
```

### course_tag_map View

```sql
CREATE VIEW public.course_tag_map AS
SELECT 
  cm.id as course_id,
  cm.organization_id,
  unnest(cm.tag_ids) as tag_id
FROM public.course_metadata cm
WHERE cm.tag_ids IS NOT NULL 
  AND array_length(cm.tag_ids, 1) > 0;
```

### Indexes

```sql
-- GIN index for efficient tag array filtering
CREATE INDEX idx_course_metadata_tags 
  ON public.course_metadata USING GIN (tag_ids);

-- Full-text search index on course ID
CREATE INDEX idx_course_metadata_search 
  ON public.course_metadata USING GIN (to_tsvector('english', id));

-- Composite index for org and visibility filtering
CREATE INDEX idx_course_metadata_org_visibility 
  ON public.course_metadata (organization_id, visibility);
```

---

## Access Control

### Global Courses
- Visible to all users (authenticated and unauthenticated)
- `visibility = 'global'`

### Organization Courses
- Only visible to authenticated users in the same organization
- `visibility = 'org'`

### RLS Policies
Visibility is enforced at the application level (and by DB constraints):
- Unauthenticated: Only global courses
- Authenticated: Global courses + own organization courses

---

## Performance Considerations

### Indexes
- **Tag filtering**: GIN index on `tag_ids` array for fast containment checks
- **Search**: GIN index with full-text search on course IDs
- **Org filtering**: Composite index on `(organization_id, visibility)`

### Pagination
- Uses offset-based pagination with `LIMIT` and `OFFSET`
- Efficient for small to medium datasets
- Consider cursor-based pagination for very large catalogs

### Caching Recommendations
- Cache course list responses for 5-15 minutes
- Invalidate cache on course updates
- Use ETags for conditional requests

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid parameters",
  "details": "limit must be between 1 and 100"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "details": "Failed to fetch courses"
}
```

---

## Testing Checklist

- [ ] Pagination works correctly (page 1, 2, 3, etc.)
- [ ] Limit parameter enforces max of 100
- [ ] Tag filtering returns only matching courses
- [ ] Search filters course IDs correctly
- [ ] Sort options work as expected
- [ ] Unauthenticated users see only public courses
- [ ] Authenticated users see org + public courses
- [ ] Empty results return proper structure
- [ ] Total count is accurate
- [ ] totalPages calculation is correct
- [ ] Indexes improve query performance
- [ ] Course data loads from storage correctly
- [ ] Failed courses are filtered out gracefully

---

## Migration Notes

### From Previous Implementation
The previous `list-courses` function scanned storage directly. The new implementation:
- Uses `course_metadata` table for efficient querying
- Adds pagination support
- Adds filtering and sorting
- Still loads actual course content from storage
- Maintains backward compatibility with course.json format

### Breaking Changes
- Response format now includes pagination fields (`total`, `page`, `pageSize`, `totalPages`)
- Courses without metadata entries won't appear (ensure all courses have metadata)
