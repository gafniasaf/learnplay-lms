# Lovable → Ignite Zero Templates

This folder contains templates for the Lovable-to-Ignite Zero handoff workflow.

## Files

| File | Purpose | When to Use |
|------|---------|-------------|
| `HANDOFF_SPEC_TEMPLATE.md` | Complete technical specification | Copy and fill out before exporting from Lovable |
| `LOVABLE_QUICK_REFERENCE.md` | One-page cheatsheet | Keep open while building in Lovable |

## Workflow

1. **Build MVP in Lovable** using the patterns from `LOVABLE_QUICK_REFERENCE.md`
2. **Create specification** by copying `HANDOFF_SPEC_TEMPLATE.md` and filling it out
3. **Export from Lovable** (GitHub or direct download)
4. **Package as zip** with:
   - Your filled-out `HANDOFF_SPEC.md`
   - All `src/` code
   - `supabase/functions/` if any
   - `package.json`
5. **Hand to Cursor agent** with Ignite Zero codebase

## Full Guide

See `docs/LOVABLE_TO_IGNITEZERO_GUIDE.md` for the complete workflow documentation.


