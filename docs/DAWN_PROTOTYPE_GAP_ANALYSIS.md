# Dawn prototype vs IgniteZero (this repo): why it can feel “ghost” + what to fix

## What “ghost system” usually means here
- **UI renders fine**, but the **data plane is inconsistent** (mix of real Edge calls, guest/dev bypasses, and silent empty-state fallbacks).
- Critical flows (play session, dashboards, admin) may be **wired differently** than the original prototype, so behavior diverges even if components look similar.

## High-signal diffs we found

### 1) App shell & routing diverged
- **Dawn prototype (`dawn-react-starter/src/App.tsx`)**
  - Uses a **CourseFrame wrapper** for `/play/*` + `/results` fullscreen routes.
  - Has explicit route composition and layout decisions at the top level.
- **IgniteZero (`src/App.tsx` + `src/routes.generated.tsx`)**
  - Uses `generatedRouteElements` and a global `Layout`, without the prototype’s `CourseRouteWrapper` behavior.
  - This impacts “realness”: play-mode UX, fullscreen framing, and embed behavior differ from the prototype.

### 2) Data context is different (and can silently “empty out”)
- **IgniteZero has `src/contexts/DawnDataContext.tsx`** which fetches entity-record data through `useMCP().listRecords(...)`.
  - It intentionally returns **empty arrays** if auth is missing or 401 happens.
  - Result: pages can look “fine” but show empty lists/tiles → **ghost feeling**.
- **Dawn prototype doesn’t have this DawnDataProvider**, it leans more on direct page-level API calls / stores.

### 3) More bypass layers exist in IgniteZero than in the prototype
IgniteZero currently contains multiple modes that can mask missing backend wiring:
- `guestMode` via localStorage/`?guest=1` (see `src/pages/Auth.tsx`, `src/components/auth/ProtectedRoute.tsx`)
- `VITE_USE_MOCK` and `VITE_ALLOW_MOCK_FALLBACK` in the API layer (catalog, knowledge map, etc.)
- `DEV_OPEN_UI` (added recently) which hardcodes Supabase config + seeded ids in `src/lib/api/common.ts`

The prototype mostly assumes “proper config + proper auth” and therefore behaves more deterministically.

### 4) API contract/behavior drift
- Prototype `dawn-react-starter/src/lib/api/common.ts` is strict: env required, bearer auth required.
- IgniteZero’s `src/lib/api/common.ts` is now hybrid and includes dev/guest bypass + agent-token mode.
  - This is powerful, but it’s also how you end up with “mock theater” if the system can succeed without a real user/session.

## The gaps that most strongly create “ghost” UX (priority order)

### P0 — Make “mode” explicit and visible in UI
- Add a persistent banner when running in guest/dev/open-ui/mock fallback:
  - “**DEV MODE**: using seeded ids + agent token” (or “**MOCK MODE**”)
- Remove silent empty returns where possible (especially from global contexts).

### P0 — Align `/play` fullscreen behavior to prototype
- Reintroduce prototype-style CourseFrame wrapping for `/play/:courseId` and `/results`:
  - This is a major “feels real” UX delta.

### P1 — Decide one data plane for each feature surface
- For example:
  - Student/Parent dashboards: Edge (live) only, no mock fallback in live mode.
  - Admin/pipeline: Edge + jobs; no “pretend queued” responses.

### P1 — Replace “silent empty” in `DawnDataProvider` with explicit states
- If unauthenticated: return a clearly labeled “Auth required” state.
- If blocked by config: show a clear BLOCKED panel (not empty lists).

### P2 — Reduce the number of bypass toggles once auth is stable
- Keep exactly one explicit switch for preview, not 4 overlapping ones.

## Next concrete step (fast)
If you want, I can generate a `docs/DAWN_PARITY_GAP.md` that lists:
- Route-by-route parity (prototype vs this repo)
- For each route: “data source”, “auth assumptions”, “known bypasses”
and then open PRs to close the top 3 gaps (CourseFrame routing + banner + DawnDataProvider behavior).


