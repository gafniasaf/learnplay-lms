# Frontend Media Standards

This document defines a single, consistent way to resolve and render media in the frontend.

## Types
- Use shared types from `src/lib/media/types.ts`:
  - `OptionMedia` – union of `ImageMedia | VideoMedia | AudioMedia | null`
  - `FitMode` – `'cover' | 'contain'`
  - `MediaLayout` – `'thumbnail' | 'full'`

## URL Resolution
- Always resolve storage-relative paths using `resolvePublicMediaUrl(url, cacheKey)` from `src/lib/media/resolvePublicMediaUrl.ts`.
  - Accepts `courses/...` or absolute `https://`/`data:` URLs
  - Uses `supabase.storage.from('courses').getPublicUrl(path)`
  - Appends `?v=cacheKey` for cache-busting

## Image Optimization
- Use `getOptimizedImageUrl()` with sizes from `src/lib/utils/mediaSizing.ts`:
  - `getOptionImageTargetWidth(viewport)` → main option tiles (desktop ~800)
  - `getOptionThumbnailWidth(viewport)` → mixed text+media thumbnails
  - Respect quality from `useResponsiveImageSizing('option')`

## Fit Logic (one source of truth)
- Compute fit using `src/lib/utils/mediaFit.ts`:
  - Desired aspect: `16/9`
  - Default tolerance: `~12%`
  - `fitModeFromRatio(ratio)` → `'cover'` if within tolerance, else `'contain'`
- Author overrides via `fitMode` are respected.

## Layout Semantics
- `mediaLayout` controls structure, not fit:
  - `'full'` → image fills entire tile; text overlays with gradient
  - `'thumbnail'` → small left thumbnail and text content
- Default for text+image is `'full'` unless explicitly set to `'thumbnail'`.

## Components
- `OptionGrid` should:
  - Use `OptionMedia` types
  - Resolve URLs via `resolvePublicMediaUrl`
  - Optimize with `getOptimizedImageUrl` + sizing helpers
  - Compute fit via `mediaFit.ts`
  - Prefer extracted tile components (`TileImage`, `TileVideo`, `TileAudio`) for readability

## Editor Controls
- `OptionsTab` exposes two toggles per option media:
  - Layout: Thumbnail | Full
  - Fit: Cover | Contain
- Persist values on the `optionMedia[index]` object.

## Debug Logging
- Use `src/lib/logging.ts` (`logger.debug`) guarded by `VITE_DEBUG_UI=true`.

## Do / Don’t
- Do: resolve via `resolvePublicMediaUrl` in all renderers
- Do: use `fitModeFromRatio` for default fit selection
- Don’t: build public URLs manually or inline object-fit decisions
