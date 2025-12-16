# Environment Configuration

## Mock Mode (Forbidden)

IgniteZero runs **live-only**. Mock mode is not supported.

- `VITE_USE_MOCK=true` is **forbidden** and should hard-fail at runtime.
- Do not use URL overrides like `?live=0`.

## Setup (`.env.local`)

Create a `.env.local` file in the project root (gitignored) with:

```env
# REQUIRED (Frontend)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key

# OPTIONAL
VITE_ENABLE_DEV=false

# Keep explicitly false (or omit); mock mode is forbidden
VITE_USE_MOCK=false
```

## Testing Notes

- Real-db Playwright runs with `VITE_USE_MOCK=false` and reads Supabase env from your local env files.
- If Supabase credentials are missing, tests should **fail loudly** with the missing env var name(s).
