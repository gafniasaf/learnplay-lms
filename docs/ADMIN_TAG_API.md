# Admin Tag Management API

## Overview

The Admin Tag Management API provides endpoints for creating and managing tags in the system. Tags are used to categorize and filter courses.

**Base URL**: `/functions/v1`

---

## Endpoints

### 1. Create Tag

Creates a new tag with proper validation and authorization.

**Endpoint**: `POST /admin-create-tag`

**Authorization**: Required (Superadmin or Org Admin)

**Request Headers**:
```
Authorization: Bearer <supabase-access-token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "type_key": "domain",
  "value": "Robotics",
  "slug": "robotics",           // Optional: auto-generated from value if not provided
  "organization_id": "uuid",     // Required for org admins, optional for superadmins
  "is_active": true              // Optional: defaults to true
}
```

**Field Descriptions**:
- `type_key` (required): The tag type key (e.g., "domain", "level", "theme", "subject", "class")
- `value` (required): Display name of the tag
- `slug` (optional): URL-friendly identifier. Auto-generated from `value` if not provided
- `organization_id` (optional): Organization UUID. Required for org admins, optional for superadmins
- `is_active` (optional): Whether the tag is active. Defaults to true

**Success Response** (201 Created):
```json
{
  "success": true,
  "tag": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "type_key": "domain",
    "value": "Robotics",
    "slug": "robotics",
    "organization_id": "660e8400-e29b-41d4-a716-446655440000",
    "is_active": true,
    "created_by": "770e8400-e29b-41d4-a716-446655440000",
    "created_at": "2025-10-31T12:30:00.000Z",
    "updated_at": "2025-10-31T12:30:00.000Z"
  }
}
```

**Error Responses**:

- **401 Unauthorized**: Missing or invalid authentication
```json
{
  "error": "Missing authorization header"
}
```

- **403 Forbidden**: User lacks required permissions
```json
{
  "error": "Unauthorized: You must be a superadmin or org admin to create tags"
}
```

- **400 Bad Request**: Missing required fields
```json
{
  "error": "Missing required fields: type_key and value"
}
```

- **400 Bad Request**: Invalid tag type
```json
{
  "error": "Tag type \"invalid-type\" does not exist"
}
```

- **409 Conflict**: Duplicate slug
```json
{
  "error": "Tag with slug \"robotics\" already exists for this type and organization"
}
```

---

## Tag Types

The system supports the following tag types:

| Type Key | Label | Description |
|----------|-------|-------------|
| `domain` | Domain | Subject domains (Mathematics, Science, Arts, etc.) |
| `level` | Level | Educational levels (Kindergarten, Elementary, etc.) |
| `theme` | Theme | Content themes (Problem Solving, STEM, etc.) |
| `subject` | Subject | Specific subjects (Algebra, Biology, History, etc.) |
| `class` | Class | Class formats (Morning, Honors, Online, etc.) |

---

## Sample Tags

The system is pre-seeded with sample tags for demo purposes:

### Domain Tags
- Mathematics, Science, Language Arts, Social Studies, Computer Science, Medicine, Arts, Physical Education, Music

### Level Tags
- Kindergarten, Elementary, Middle School, High School, College, Professional

### Theme Tags
- Problem Solving, Critical Thinking, Collaboration, Creativity, Communication, Real World, STEM

### Subject Tags
- Algebra, Geometry, Biology, Chemistry, Physics, History, Geography, Literature, Writing, Reading

### Class Tags
- Morning, Afternoon, Honors, AP, Remedial, Online, Hybrid

---

## Authorization Rules

### Superadmins
- Can create global tags (organization_id = null)
- Can create organization-specific tags for any organization
- Can manage all tags in the system

### Org Admins
- Can only create tags for their own organization
- Must provide organization_id in the request
- Can only manage tags within their organization

### Students/Teachers
- Read-only access to active tags
- Cannot create or modify tags

---

## cURL Examples

### Create Global Tag (Superadmin)
```bash
curl -X POST 'https://grffepyrmjihphldyfha.supabase.co/functions/v1/admin-create-tag' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "type_key": "domain",
    "value": "Robotics",
    "slug": "robotics",
    "is_active": true
  }'
```

### Create Organization Tag (Org Admin)
```bash
curl -X POST 'https://grffepyrmjihphldyfha.supabase.co/functions/v1/admin-create-tag' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "type_key": "subject",
    "value": "Advanced Calculus",
    "organization_id": "660e8400-e29b-41d4-a716-446655440000",
    "is_active": true
  }'
```

---

## JavaScript/TypeScript Example

```typescript
import { supabase } from '@/integrations/supabase/client';

async function createTag(tagData: {
  type_key: string;
  value: string;
  slug?: string;
  organization_id?: string;
  is_active?: boolean;
}) {
  const { data, error } = await supabase.functions.invoke('admin-create-tag', {
    body: tagData,
  });

  if (error) {
    console.error('Error creating tag:', error);
    throw error;
  }

  return data;
}

// Example usage
const newTag = await createTag({
  type_key: 'domain',
  value: 'Robotics',
  slug: 'robotics',
  is_active: true,
});

console.log('Created tag:', newTag.tag);
```

---

## React Hook Example

```typescript
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CreateTagData {
  type_key: string;
  value: string;
  slug?: string;
  organization_id?: string;
  is_active?: boolean;
}

export function useCreateTag() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const createTag = async (tagData: CreateTagData) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-tag', {
        body: tagData,
      });

      if (error) throw error;

      toast({
        title: 'Tag Created',
        description: `Successfully created tag: ${data.tag.value}`,
      });

      return data.tag;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create tag',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return { createTag, loading };
}

// Usage in component
function CreateTagForm() {
  const { createTag, loading } = useCreateTag();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createTag({
      type_key: 'domain',
      value: 'Robotics',
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Tag'}
      </button>
    </form>
  );
}
```

---

## Database Schema

### Tags Table Structure

```sql
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  type_key text NOT NULL,
  value text NOT NULL,
  slug text NOT NULL,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  -- Unique constraints
  CONSTRAINT tags_unique_org_type_slug UNIQUE (organization_id, type_key, slug),
  CONSTRAINT tags_unique_global_type_slug UNIQUE (type_key, slug) WHERE organization_id IS NULL
);
```

### Row-Level Security

```sql
-- Superadmins can manage all tags
CREATE POLICY "superadmins_manage_all_tags"
ON public.tags FOR ALL
TO authenticated
USING (is_superadmin(auth.uid()))
WITH CHECK (is_superadmin(auth.uid()));

-- Org admins can manage org-specific tags
CREATE POLICY "org_admins_manage_org_tags"
ON public.tags FOR ALL
TO authenticated
USING (
  organization_id IS NOT NULL 
  AND user_has_org_role(auth.uid(), organization_id, ARRAY['school_admin'])
)
WITH CHECK (
  organization_id IS NOT NULL 
  AND user_has_org_role(auth.uid(), organization_id, ARRAY['school_admin'])
);

-- All authenticated users can view active tags
CREATE POLICY "users_view_active_tags"
ON public.tags FOR SELECT
TO authenticated
USING (
  is_active = true
  AND (organization_id IS NULL OR user_in_org(auth.uid(), organization_id))
);
```

---

## Best Practices

1. **Slug Generation**: Always use lowercase, hyphenated slugs for consistency
2. **Uniqueness**: Ensure slugs are unique within the same organization and type
3. **Organization Context**: Org admins must always provide organization_id
4. **Validation**: Verify tag type exists before creating tags
5. **Audit Trail**: The `created_by` field tracks who created each tag
6. **Soft Deletion**: Use `is_active = false` instead of deleting tags

---

## Testing

See [API_TESTS.md](./API_TESTS.md) for comprehensive testing examples.
