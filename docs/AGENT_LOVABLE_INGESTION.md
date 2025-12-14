# Agent Instructions: Lovable MVP Ingestion

> **For Cursor AI agents receiving a Lovable export**
> 
> Follow these instructions to rebuild the Lovable MVP in Ignite Zero.
> Do NOT ask the user questions unless you are blocked.

---

## Quick Start (Automated)

```bash
# 1. Unzip the handoff package to a folder (e.g., ./lovable-import)

# 2. Run the ingestion script
npx tsx scripts/ingest-lovable.ts ./lovable-import

# 3. If verify fails, fix errors and re-run
npm run verify
```

If the script succeeds, you're done. If it fails, follow the manual steps below.

---

## Manual Ingestion Steps

### Step 1: Read Handoff Files (DO NOT SKIP)

```
READ these files from the handoff package:
1. HANDOFF_SPEC.md - Understand the app, entities, features
2. SUPABASE_SCHEMA.sql - Database tables and RLS policies
```

### Step 2: Read Ignite Zero Context

```
READ: docs/AI_CONTEXT.md
This contains architecture rules you must follow.
```

### Step 3: Update Manifest

Edit `system-manifest.json` based on HANDOFF_SPEC.md:

```json
{
  "branding": {
    "name": "[Project Name from HANDOFF_SPEC]",
    "terminology": {
      "root_entity": "[Main Entity Name]",
      "root_entity_plural": "[Main Entity Plural]"
    }
  },
  "data_model": [
    {
      "name": "[Entity]",
      "type": "root_entity",
      "table": "[table_name from SUPABASE_SCHEMA.sql]"
    }
  ],
  "user_roles": ["admin", "user"]
}
```

### Step 4: Run Scaffold

```bash
npx tsx scripts/scaffold-manifest.ts
```

This generates `src/lib/contracts.ts` from the manifest.

### Step 5: Copy React Code

```bash
# Backup existing src
mv src src-backup-$(date +%s)

# Copy from Lovable export
cp -r ./lovable-import/src ./src

# Copy edge functions if present
cp -r ./lovable-import/supabase/functions/* ./supabase/functions/
```

### Step 6: Fix TypeScript Errors

```bash
npm run typecheck
```

Common fixes needed:

| Error | Fix |
|-------|-----|
| `Cannot find module '@/lib/logger'` | Remove the import, use `console.warn` |
| `Property 'X' does not exist on type 'Y'` | Update type definitions in src/types/ |
| `Type 'any' not assignable to...` | Add proper type annotations |
| Import path mismatches | Update paths to match Ignite Zero structure |

### Step 7: Save Schema

```bash
# Copy the schema SQL
cp ./lovable-import/SUPABASE_SCHEMA.sql ./supabase/schema-from-lovable.sql
```

Tell the user:
> "Run `supabase/schema-from-lovable.sql` in your Supabase SQL editor to create the tables."

### Step 8: Export Mocks (if mock system exists)

```bash
npx tsx scripts/export-mocks.ts
```

### Step 9: Run Verify

```bash
npm run verify
```

If this passes, you're done.

---

## Blocking Scenarios (Ask User)

Only ask the user if you encounter these situations:

| Situation | What to Ask |
|-----------|-------------|
| Missing HANDOFF_SPEC.md | "The handoff package is missing HANDOFF_SPEC.md. Can you provide it?" |
| Missing src/ folder | "The handoff package doesn't contain a src/ folder. Is this the correct export?" |
| Supabase credentials needed | "I need VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to test. Can you provide them?" |
| Unresolvable type errors | "I'm stuck on these TypeScript errors: [list]. Can you clarify the expected types?" |

---

## Do NOT Ask About

- File structure decisions (follow Ignite Zero conventions)
- Which files to copy (copy all of src/)
- How to fix common TypeScript errors (fix them yourself)
- Whether to run verify (always run it)

---

## Success Criteria

The ingestion is complete when:

```bash
npm run typecheck  # ✅ No errors
npm run verify     # ✅ All checks pass
```

---

## Post-Ingestion Tasks

After successful ingestion, these may be needed:

1. **Wire MCP hooks** - Replace direct Supabase calls with `useMCP()` pattern
2. **Add semantic CTA IDs** - Add `data-cta-id` to important buttons
3. **Re-export mocks** - Run `npx tsx scripts/export-mocks.ts`
4. **Update coverage.json** - Add routes/CTAs from HANDOFF_SPEC.md

---

## Example Session

```
User: Here's the Lovable export [attaches handoff-task-manager.zip]

Agent: [Does not ask questions, just executes]
> Extracting handoff-task-manager.zip...
> Reading HANDOFF_SPEC.md... Project: Minimal Task Manager
> Reading SUPABASE_SCHEMA.sql... Found table: tasks
> Updating system-manifest.json...
> Copying src/ to Ignite Zero...
> Running scaffold-manifest.ts...
> Running typecheck...
> Found 3 TypeScript errors, fixing...
> Running verify...
> ✅ All checks passed.
>
> The Lovable MVP has been ingested into Ignite Zero.
> 
> To complete setup:
> 1. Run the SQL in supabase/schema-from-lovable.sql in your Supabase project
> 2. Set environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
> 3. Run: npm run dev
```


