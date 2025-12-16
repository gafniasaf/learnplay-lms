# Lovable → Ignite Zero Quick Reference Card

> Print this or keep it open while building in Lovable

---

## 🚀 Starting Prompt Template

```
Build a [DOMAIN] app with:
- React 18 + TypeScript + Vite + Tailwind + shadcn/ui
- Supabase for auth and database
- Multi-role: [admin, user, etc.]
- Main entity: [Entity] with [key fields]
- Pages: Dashboard per role, List, Detail, Editor
```

---

## 📁 Required File Structure

```
src/
├── components/
│   ├── ui/           # shadcn
│   └── [Entity]/     # Domain components
├── pages/
│   └── [role]/       # Role pages
├── hooks/
│   ├── useAuth.ts
│   └── use[Entity].ts
├── types/
│   └── index.ts
└── integrations/
    └── supabase/
```

---

## ✅ Build Checklist

### Structure
- [ ] Multi-role dashboards at `/[role]/dashboard`
- [ ] Components named: `[Entity]Card`, `[Entity]Modal`, etc.
- [ ] Hooks named: `use[Entity].ts`
- [ ] Types in `src/types/`

### Functionality  
- [ ] Auth works (login/logout/role detection)
- [ ] CRUD operations work
- [ ] RLS enabled on tables
- [ ] Error handling with toasts
- [ ] Loading states on async

### Quality
- [ ] No console errors
- [ ] TypeScript types complete
- [ ] Mobile responsive

---

## 📝 Before Export

1. Create `HANDOFF_SPEC.md` with:
   - Entity model (tables, fields)
   - Routes table (path, component, role)
   - CTAs table (page, button, action)
   - Supabase schema (CREATE TABLE statements)
   - Known limitations

2. Test happy path end-to-end

3. Remove console.logs (except errors)

---

## 📦 Handoff Package Contents

```
handoff-[name].zip/
├── HANDOFF_SPEC.md    ← You create this
├── src/               ← React code
├── supabase/          ← Edge functions
├── package.json
└── README.md
```

---

## 🤖 Agent Instructions (Include with Zip)

```
IGNITE ZERO RECONSTRUCTION:
1. Read HANDOFF_SPEC.md
2. Read docs/AI_CONTEXT.md
3. Update system-manifest.json
4. Run: npx tsx scripts/scaffold-manifest.ts
5. Copy src/ from handoff
6. Fix TypeScript errors
7. Run: npx tsx scripts/export-mocks.ts
8. Update coverage.json with CTAs
9. Run: npm run verify
10. Wire MCP hooks
```

---

## 🎯 Critical CTA Examples

| Page | Button | Must Work? |
|------|--------|------------|
| Dashboard | "Create New" | ✅ Yes |
| Modal | "Save" | ✅ Yes |
| Modal | "Cancel" | ✅ Yes |
| List | "Delete" | ⚠️ Medium |
| Detail | "Edit" | ✅ Yes |
| Header | "Logout" | ✅ Yes |

---

## 🔧 Lovable Prompts for Common Fixes

**Fix types:**
```
Add TypeScript types for all components. 
Create interfaces in src/types/.
```

**Add error handling:**
```
Add try/catch to all Supabase calls.
Show toast on error. Add loading states.
```

**IgniteZero (no mocks):**
```
Do NOT create a mock data layer or a useMock toggle.
If the backend is missing, surface a clear BLOCKED state that names the required Edge Function / env var.
```

**Fix structure:**
```
Move pages to src/pages/[role]/.
Move entity components to src/components/[Entity]/.
```

---

## ⚠️ Common Mistakes

| Mistake | Fix |
|---------|-----|
| `any` types everywhere | Define interfaces |
| No error handling | Add try/catch + toast |
| No loading states | Add isLoading checks |
| Console.logs left in | Remove before export |
| Missing HANDOFF_SPEC | Create from template |
| RLS not enabled | Add RLS policies |

---

## 📋 Supabase Table Template

```sql
CREATE TABLE [entities] (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content JSONB DEFAULT '{}',
  organization_id UUID NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE [entities] ENABLE ROW LEVEL SECURITY;
```

---

## 🔗 Key Files in Ignite Zero

| Purpose | File |
|---------|------|
| Architecture rules | `docs/AI_CONTEXT.md` |
| Manifest | `system-manifest.json` |
| Contracts | `src/lib/contracts.ts` |
| MCP hooks | `src/hooks/useMCP.ts` |
| Mock export | `scripts/export-mocks.ts` |
| CTA coverage | `docs/mockups/coverage.json` |
| Verification | `npm run verify` |

---

**Goal: Fast MVP in Lovable → Clean handoff → Production Ignite Zero**

