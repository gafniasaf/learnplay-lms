# Image Optimization Plan

## Current State
- **DALL-E 3**: 1024x1024 PNG images
- **File Size**: 1-2.5 MB per image
- **Format**: PNG (no compression)
- **Loading**: Slow on mobile/poor connections

## Implemented (Phase 1)
✅ **Aggressive Caching**: Changed from 3600s to 31536000s (1 year, immutable)
✅ **Metadata Tracking**: Original size logged
✅ **Placeholder for Optimization**: optimizeImage() function ready

## Phase 2: Full Optimization (Requires Image Library)

### Option A: Client-Side Optimization (Recommended)
**Implement in React UI before displaying:**

```typescript
// src/lib/utils/imageOptimizer.ts
export async function optimizeImageUrl(url: string): Promise<string> {
  // Use browser's Canvas API to resize and compress
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  
  await new Promise((resolve) => { img.onload = resolve; });
  
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  
  const ctx = canvas.getContext('2d');
  ctx?.drawImage(img, 0, 0, 512, 512);
  
  // Convert to WebP at 85% quality
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', 0.85);
  });
  
  return URL.createObjectURL(blob);
}
```

**Benefits:**
- No server-side library needed
- Works in browser
- 75% size reduction
- Fast implementation

### Option B: Server-Side with Sharp (Better Quality)
**Add to edge function:**

```typescript
import sharp from 'sharp';  // Needs Deno-compatible version

async function optimizeImage(blob: Blob): Promise<Blob> {
  const buffer = await blob.arrayBuffer();
  
  const optimized = await sharp(Buffer.from(buffer))
    .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .webp({ quality: 85 })
    .toBuffer();
  
  return new Blob([optimized], { type: 'image/webp' });
}
```

**Benefits:**
- Better quality control
- Consistent results
- Handles transparency
- Professional grade

## Recommended: Hybrid Approach

1. **Generate at 1024x1024** (DALL-E 3 requirement)
2. **Download and optimize server-side** before Storage upload
3. **Serve optimized WebP** to clients
4. **Lazy load** in UI (already done ✅)

## Performance Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| File Size | 1.5 MB | 300 KB | 80% smaller |
| Load Time (3G) | 4.5s | 0.9s | 5x faster |
| Bandwidth | High | Low | 80% savings |
| Quality | Excellent | Very Good | Minimal loss |

## Implementation Priority

**High Priority:**
- ✅ Aggressive caching (done)
- 🔲 Client-side resize on display (15 min)
- 🔲 Change extension to .webp in storage paths

**Medium Priority:**
- 🔲 Server-side optimization with sharp
- 🔲 Thumbnail generation (256x256)
- 🔲 Progressive loading

**Low Priority:**
- 🔲 CDN integration
- 🔲 Multiple size variants (srcset)
- 🔲 Blur placeholder

