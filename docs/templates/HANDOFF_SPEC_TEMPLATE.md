# Technical Specification: [PROJECT NAME]

> **Export Date**: [DATE]  
> **Lovable Project URL**: [URL]  
> **Built By**: [YOUR NAME]

---

## 1. Domain Overview

**What this app does**:  
[One paragraph description of the application]

**Target users**:  
[Who will use this app - be specific about roles]

**Core workflow** (main user journey):
1. User [action 1]
2. System [response 1]
3. User [action 2]
4. System [response 2]
5. User achieves [goal]

---

## 2. Entity Model

### Root Entity: [NAME]
*The main thing users create/manage*

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | uuid | Yes | Primary key (auto-generated) |
| title | string | Yes | Display name |
| description | string | No | Long description |
| content | json | Yes | Main content blob |
| status | enum | Yes | draft/published/archived |
| organization_id | uuid | Yes | Tenant isolation |
| created_by | uuid | Yes | User who created |
| created_at | timestamp | Yes | Creation time |
| updated_at | timestamp | Yes | Last modified |

### Child Entity: [NAME]
*Things that belong to the root entity*

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | uuid | Yes | Primary key |
| [root]_id | uuid | Yes | FK to root entity |
| title | string | Yes | Display name |
| order | integer | Yes | Sort order |
| data | json | No | Additional data |

### Additional Entities
*List any other entities*

| Entity | Parent | Purpose |
|--------|--------|---------|
| [entity] | [parent] | [purpose] |

---

## 3. User Roles

| Role | Display Name | Access Level | Description |
|------|--------------|--------------|-------------|
| admin | Administrator | Full | Can manage everything |
| [role2] | [Name] | [Level] | [What they can do] |
| [role3] | [Name] | [Level] | [What they can do] |

### Role Permissions Matrix

| Action | admin | [role2] | [role3] |
|--------|-------|---------|---------|
| Create [entity] | ✅ | ✅ | ❌ |
| Edit [entity] | ✅ | ✅ own | ❌ |
| Delete [entity] | ✅ | ❌ | ❌ |
| View [entity] | ✅ | ✅ | ✅ |

---

## 4. Routes & Pages

| Route | Component File | Purpose | Auth Required | Roles |
|-------|---------------|---------|---------------|-------|
| `/` | Landing.tsx | Portal/role selection | No | - |
| `/auth` | Auth.tsx | Login/signup | No | - |
| `/admin/dashboard` | AdminDashboard.tsx | Admin home | Yes | admin |
| `/[role]/dashboard` | [Role]Dashboard.tsx | Role home | Yes | [role] |
| `/[role]/[entity]` | [Entity]List.tsx | List view | Yes | [role] |
| `/[role]/[entity]/:id` | [Entity]Detail.tsx | Detail view | Yes | [role] |
| `/[role]/[entity]/:id/edit` | [Entity]Editor.tsx | Edit view | Yes | [role] |

---

## 5. Critical CTAs (Calls to Action)

### High Priority (Must Work)

| Page | Button/Link | Text | Action | Expected Result |
|------|-------------|------|--------|-----------------|
| Dashboard | Button | "Create New" | Open create modal | Modal opens |
| Dashboard | Card click | - | Navigate to detail | Detail page loads |
| Modal | Button | "Save" | Save to Supabase | Item created, modal closes |
| Modal | Button | "Cancel" | Close modal | Modal closes, no save |
| Detail | Button | "Edit" | Open editor | Editor opens |
| Editor | Button | "Save" | Save changes | Changes saved |

### Medium Priority (Should Work)

| Page | Button/Link | Text | Action | Expected Result |
|------|-------------|------|--------|-----------------|
| List | Button | "Delete" | Delete item | Item removed |
| List | Input | Search | Filter list | List filtered |
| Header | Link | "Logout" | Sign out | Redirected to login |

### Low Priority (Nice to Have)

| Page | Button/Link | Text | Action | Expected Result |
|------|-------------|------|--------|-----------------|

---

## 6. Supabase Schema

### Table: user_profiles
```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  organization_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own" ON user_profiles
  FOR SELECT USING (auth.uid() = id);
```

### Table: [root_entity_plural]
```sql
CREATE TABLE [root_entity_plural] (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  content JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  organization_id UUID NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE [root_entity_plural] ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON [root_entity_plural]
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );
```

### Table: [child_entity_plural]
```sql
CREATE TABLE [child_entity_plural] (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  [root_entity]_id UUID NOT NULL REFERENCES [root_entity_plural](id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE [child_entity_plural] ENABLE ROW LEVEL SECURITY;

-- RLS through parent
CREATE POLICY "via_parent" ON [child_entity_plural]
  FOR ALL USING (
    [root_entity]_id IN (SELECT id FROM [root_entity_plural])
  );
```

---

## 7. Edge Functions

### Function: [function-name]
**Location**: `supabase/functions/[function-name]/index.ts`

**Purpose**: [What this function does]

**HTTP Method**: POST

**Authentication**: Required (Bearer token)

**Request Body**:
```typescript
{
  fieldOne: string;
  fieldTwo: number;
  optionalField?: boolean;
}
```

**Response (Success)**:
```typescript
{
  success: true;
  data: {
    resultId: string;
    // ...
  };
}
```

**Response (Error)**:
```typescript
{
  success: false;
  error: string;
  code: "INVALID_INPUT" | "NOT_FOUND" | "UNAUTHORIZED";
}
```

**Example Call**:
```typescript
const { data } = await supabase.functions.invoke('[function-name]', {
  body: { fieldOne: 'value', fieldTwo: 42 }
});
```

---

## 8. Environment Variables

| Variable | Required | Purpose | Example Value |
|----------|----------|---------|---------------|
| VITE_SUPABASE_URL | Yes | Supabase project URL | https://abc.supabase.co |
| VITE_SUPABASE_ANON_KEY | Yes | Public anon key | eyJhbGciOi... |
| VITE_APP_NAME | No | App display name | MyApp |

---

## 9. Component Inventory

### Pages (src/pages/)
| File | Description | Status |
|------|-------------|--------|
| Landing.tsx | Entry portal | ✅ Complete |
| Auth.tsx | Login/signup | ✅ Complete |
| [Role]Dashboard.tsx | Main dashboard | ✅ Complete |
| [Entity]List.tsx | List view | ✅ Complete |
| [Entity]Detail.tsx | Detail view | ⚠️ Partial |

### Shared Components (src/components/)
| File | Description | Props |
|------|-------------|-------|
| [Entity]Card.tsx | Display card | { item, onClick } |
| [Entity]Modal.tsx | Create/edit modal | { isOpen, onClose, item? } |
| Header.tsx | App header | { user, onLogout } |
| Sidebar.tsx | Navigation | { role, activeRoute } |

### Hooks (src/hooks/)
| File | Description | Returns |
|------|-------------|---------|
| useAuth.ts | Auth state | { user, role, loading, login, logout } |
| use[Entity].ts | CRUD operations | { items, create, update, delete, loading } |

---

## 10. Known Limitations & TODOs

### Not Implemented
- [ ] [Feature that's not built]
- [ ] [Feature that's not built]

### Partially Working
- [ ] [Feature that has issues] - Issue: [description]
- [ ] [Feature that has issues] - Issue: [description]

### Technical Debt
- [ ] [Code that needs cleanup]
- [ ] [Type that's using `any`]
- [ ] [Missing error handling in X]

### Suggested Improvements for Ignite Zero
- [ ] Add proper contract validation
- [ ] Wire MCP hooks for [actions]
- [ ] Add CTA coverage for [pages]

---

## 11. Screenshots

### Landing Page
[Screenshot or description]

### Dashboard (Admin)
[Screenshot or description]

### Dashboard ([Role])
[Screenshot or description]

### Create/Edit Modal
[Screenshot or description]

### Mobile View
[Screenshot or description]

---

## 12. Testing Notes

### Happy Path Test
1. Go to `/`
2. Click login
3. Enter credentials: [test account]
4. Verify dashboard loads
5. Click "Create New"
6. Fill form, click Save
7. Verify item appears in list
8. Click item
9. Verify detail page loads
10. Click Edit, make change, Save
11. Verify change persisted

### Known Issues During Testing
- [Issue and workaround]

---

## 13. Ignite Zero Integration Notes

### Manifest Mapping
```json
{
  "branding": {
    "name": "[App Name]",
    "terminology": {
      "root_entity": "[RootEntity]",
      "root_entity_plural": "[RootEntities]",
      "child_entity": "[ChildEntity]",
      "child_entity_plural": "[ChildEntities]"
    }
  },
  "data_model": [
    {
      "name": "[RootEntity]",
      "type": "root_entity",
      "table": "[root_entity_plural]"
    },
    {
      "name": "[ChildEntity]",
      "type": "child_entity",
      "table": "[child_entity_plural]"
    }
  ],
  "user_roles": ["admin", "[role2]", "[role3]"]
}
```

### Files to Copy to Ignite Zero
```
src/pages/        → src/pages/
src/components/   → src/components/
src/hooks/        → src/hooks/
src/types/        → src/types/
supabase/functions/ → supabase/functions/
```

### Files to NOT Copy (Ignite Zero has its own)
```
src/integrations/supabase/client.ts  (use Ignite Zero's)
src/lib/utils.ts                      (merge carefully)
```

---

**End of Specification**

*Generated for Ignite Zero handoff on [DATE]*


