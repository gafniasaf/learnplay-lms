# Lovable deployment (no env vars): Runtime config

Lovable can “just build from GitHub” without giving you a UI to set Vite env vars.
To make the app work for end clients in Lovable, this repo supports a **runtime config file**:

## `public/app-config.json`

This file is served at `/app-config.json` and is read at startup.

Required fields:
- `supabase.url`
- `supabase.publishableKey` (aka anon key; **public** by design)

Example:

```json
{
  "supabase": {
    "url": "https://YOUR_PROJECT_REF.supabase.co",
    "publishableKey": "eyJ..."
  }
}
```

## Notes
- This is **not** a service role key; it’s safe to ship (anon/publishable key).
- Auth redirect URLs still must be configured in Supabase Dashboard for Lovable origins.


