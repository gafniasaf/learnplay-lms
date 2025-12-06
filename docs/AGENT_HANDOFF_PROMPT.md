# Agent Handoff Prompt

Copy this prompt and attach your Lovable export zip file when starting a new Cursor agent session:

---

## The Prompt (Copy This)

```
Ingest this Lovable MVP export into the Ignite Zero system.

Instructions:
1. Run: npx tsx scripts/ingest-lovable.ts [path-to-extracted-folder]
2. If that fails, follow docs/AGENT_LOVABLE_INGESTION.md manually
3. Fix any TypeScript errors without asking me
4. Run npm run verify until it passes
5. Only ask me questions if you are blocked

Do not ask questions about file structure, naming conventions, or how to fix common errors.
Just do it.

[Attached: handoff-[project-name].zip]
```

---

## What Happens

The agent will:
1. Extract your zip
2. Read HANDOFF_SPEC.md and SUPABASE_SCHEMA.sql
3. Update system-manifest.json
4. Copy React code to src/
5. Fix TypeScript errors
6. Run verification
7. Report success or blocking issues

---

## If the Agent Gets Stuck

If the agent asks a question, it means one of:
- Missing file (HANDOFF_SPEC.md, SUPABASE_SCHEMA.sql)
- Credentials needed (Supabase URL/key)
- Unresolvable error (complex type mismatch)

Answer the question and it will continue.

---

## Success Output

```
✅ All checks passed.

The Lovable MVP has been ingested into Ignite Zero.

To complete setup:
1. Run the SQL in supabase/schema-from-lovable.sql in your Supabase project
2. Set environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
3. Run: npm run dev
```

