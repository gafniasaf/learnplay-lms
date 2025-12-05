# Media Storage Standards

## Overview

This document defines standards for storing AI-generated media assets in Supabase Storage, including naming conventions, metadata schemas, versioning, and path structures.

---

## **Storage Structure**

### **Bucket**: `courses`

All course-related media is stored in the `courses` bucket with the following structure:

```
courses/
├── {courseId}/
│   ├── course.json
│   └── assets/
│       ├── images/
│       │   ├── item-{itemId}-{timestamp}.png
│       │   ├── item-{itemId}-{timestamp}@v2.png
│       │   └── study-text-{textId}-section-{sectionId}-{timestamp}.png
│       ├── audios/
│       │   ├── item-{itemId}-{timestamp}.mp3
│       │   └── transcript-{itemId}-{timestamp}.txt
│       └── videos/
│           ├── item-{itemId}-{timestamp}.mp4
│           └── captions-{itemId}-{timestamp}.vtt
```

---

## **Naming Conventions**

### **Item Stimulus Media**

**Pattern**: `item-{itemId}-{timestamp}.{ext}`

**Examples**:
- `item-42-1698765432000.png`
- `item-42-1698765432000.mp3`
- `item-42-1698765432000.mp4`

**Versioned** (regenerated):
- `item-42-1698765432000@v2.png`
- `item-42-1698765432000@v3.png`

### **Item Option Media (Visual MCQ)**

**Pattern**: `item-{itemId}-option-{optionIndex}-{timestamp}.{ext}`

**Examples**:
- `item-10-option-0-1698765432000.png` (first option)
- `item-10-option-1-1698765432000.png` (second option)
- `item-10-option-2-1698765432000.png` (third option)
- `item-10-option-3-1698765432000.png` (fourth option)

**Versioned**:
- `item-10-option-0-1698765432000@v2.png`

### **Study Text Media**

**Pattern**: `study-text-{textId}-section-{sectionId}-{timestamp}.{ext}`

**Examples**:
- `study-text-liver-overview-section-anatomy-1698765432000.png`
- `study-text-photosynthesis-section-intro-1698765432000.png`

**Versioned**:
- `study-text-liver-overview-section-anatomy-1698765432000@v2.png`

### **Supporting Files**

**Audio Transcripts**: `transcript-{itemId}-{timestamp}.txt`  
**Video Captions**: `captions-{itemId}-{timestamp}.vtt`  

---

## **File Extensions**

| Media Type | Extensions | Default |
|------------|-----------|---------|
| Image | `.png`, `.jpg`, `.webp` | `.png` |
| Audio | `.mp3`, `.ogg`, `.wav` | `.mp3` |
| Video | `.mp4`, `.webm`, `.ogg` | `.mp4` |
| Transcript | `.txt`, `.vtt`, `.srt` | `.txt` |
| Captions | `.vtt`, `.srt` | `.vtt` |

---

## **Metadata Schema**

All uploaded files MUST include metadata in the `metadata` field of the Storage upload.

### **Required Fields**

```typescript
{
  provider: string;        // e.g., 'openai-dalle3', 'replicate-sdxl'
  model: string;           // e.g., 'dall-e-3', 'sdxl'
  prompt: string;          // AI prompt used
  cost_usd: string;        // Generation cost (string for Storage)
  generation_time_ms: string;  // Time taken (string for Storage)
}
```

### **Optional Fields**

```typescript
{
  revised_prompt?: string;     // OpenAI revised prompt
  dimensions?: string;          // "1024x1024" or "1792x1024"
  duration?: string;            // For audio/video (seconds)
  file_size?: string;           // Bytes
  style?: string;               // e.g., 'diagram', 'photo', 'illustration'
  seed?: string;                // For reproducible generation
  version?: string;             // e.g., 'v2', 'v3'
  target_type?: string;         // 'item_stimulus', 'item_option', 'study_text'
  target_item_id?: string;      // Item ID reference
  target_option_index?: string; // For option media
}
```

### **Example Upload**

```typescript
await supabase.storage
  .from('courses')
  .upload('biology-101/assets/images/item-42-1698765432000.png', blob, {
    upsert: true,
    contentType: 'image/png',
    cacheControl: '3600',
    metadata: {
      provider: 'openai-dalle3',
      model: 'dall-e-3',
      prompt: 'Detailed anatomical diagram of liver lobes',
      cost_usd: '0.04',
      generation_time_ms: '12543',
      dimensions: '1024x1024',
      style: 'diagram',
      version: 'v1',
      target_type: 'item_stimulus',
      target_item_id: '42',
    },
  });
```

---

## **Versioning**

### **Logical ID System**

Each unique media asset has a **logical ID** that remains stable across versions.

**Logical ID Pattern**: `{courseId}-item-{itemId}-{type}`

**Examples**:
- `biology-101-item-42-stimulus`
- `biology-101-item-10-option-0`
- `biology-101-study-text-liver-overview-section-anatomy`

### **Version Suffix**

When media is regenerated, append `@vN` to the filename:

**V1 (Original)**:
```
item-42-1698765432000.png
```

**V2 (Regenerated)**:
```
item-42-1698765555000@v2.png
```

**V3 (Regenerated Again)**:
```
item-42-1698765666000@v3.png
```

### **Database Tracking**

The `media_assets` table tracks versions:

```sql
logical_id: 'biology-101-item-42-stimulus'
version: 1
storage_path: 'biology-101/assets/images/item-42-1698765432000.png'

logical_id: 'biology-101-item-42-stimulus'
version: 2
storage_path: 'biology-101/assets/images/item-42-1698765555000@v2.png'
```

### **Course JSON References**

**Option 1: Direct URLs** (Current)
```json
{
  "stimulus": {
    "type": "image",
    "url": "/storage/v1/object/public/courses/biology-101/assets/images/item-42-1698765432000.png"
  }
}
```

**Option 2: Logical IDs** (Future)
```json
{
  "stimulus": {
    "type": "image",
    "mediaId": "biology-101-item-42-stimulus"
  }
}
```

The resolver fetches the latest version from `media_assets` table.

---

## **Cache Control**

| Media Type | Cache-Control | Rationale |
|------------|---------------|-----------|
| Images | `public, max-age=31536000, immutable` | Never changes once uploaded |
| Audio | `public, max-age=31536000, immutable` | Never changes once uploaded |
| Video | `public, max-age=31536000, immutable` | Never changes once uploaded |
| Transcripts | `public, max-age=86400` | May be updated/corrected |
| Captions | `public, max-age=86400` | May be updated/corrected |

### **Versioned Assets**

Once uploaded with a version suffix, assets are **immutable**. Use aggressive caching:

```
Cache-Control: public, max-age=31536000, immutable
```

---

## **Content Types**

| Extension | MIME Type |
|-----------|-----------|
| `.png` | `image/png` |
| `.jpg` | `image/jpeg` |
| `.webp` | `image/webp` |
| `.mp3` | `audio/mpeg` |
| `.ogg` | `audio/ogg` |
| `.wav` | `audio/wav` |
| `.mp4` | `video/mp4` |
| `.webm` | `video/webm` |
| `.txt` | `text/plain; charset=utf-8` |
| `.vtt` | `text/vtt; charset=utf-8` |
| `.srt` | `application/x-subrip; charset=utf-8` |

---

## **Size Limits**

| Media Type | Max Size | Recommended |
|------------|----------|-------------|
| Image | 10 MB | 1-2 MB |
| Audio | 25 MB | 1-5 MB |
| Video | 100 MB | 10-50 MB |
| Transcript | 1 MB | 10-50 KB |
| Captions | 1 MB | 10-50 KB |

---

## **Accessibility Requirements**

### **Images**

- **MUST** have `alt` text in course JSON
- Fallback: `"{courseTitle} - Item {itemId}"`

### **Audio**

- **SHOULD** have transcript file
- Transcript path in course JSON: `transcriptUrl`

### **Video**

- **SHOULD** have captions file (VTT format)
- Captions path in course JSON: `captionsUrl`
- Captions **MUST** be in English (default track)

---

## **Migration Path**

### **Phase 1: Direct URLs** (Current)

Courses reference Storage URLs directly.

### **Phase 2: Logical IDs**

1. Scan all course JSON files
2. For each media URL, create `media_assets` record
3. Generate logical ID
4. Update course JSON to use `mediaId`
5. Add resolver to the entity loader to inject URLs

### **Phase 3: CDN**

1. Configure CDN in front of Supabase Storage
2. Update `getPublicUrl` to use CDN domain
3. Set aggressive caching headers

---

## **Security**

### **Public Access**

All media in `courses` bucket is **public**.

- No authentication required to view
- Read-only access via public URLs
- Write access restricted via RLS

### **Moderation**

Media with `moderation_status = 'pending'` or `'flagged'` in `media_assets` table:

- Still publicly accessible (URL doesn't change)
- Marked in database for admin review
- Can be quarantined (status = 'quarantined') to prevent display

---

## **Performance Best Practices**

1. **Use lazy loading** for images in UI (`loading="lazy"`)
2. **Use responsive images** where appropriate (srcset)
3. **Optimize file sizes** before upload (compress images, transcode video)
4. **Set appropriate dimensions** (1024x1024 for most images)
5. **Use aspect ratio containers** to prevent layout shift
6. **Preload critical media** (e.g., first question stimulus)

---

## **Cleanup Policy**

### **Orphaned Assets**

Media files with no references in any course JSON:

- Scan monthly via cron job
- Mark as `status = 'archived'` in `media_assets`
- Move to `archived/` folder after 90 days
- Delete after 180 days

### **Unused Versions**

Old versions of regenerated media:

- Keep latest version active
- Mark previous versions as `archived`
- Retain for 30 days for rollback
- Delete after 30 days (except v1, kept indefinitely)

---

**Last Updated:** 2025-10-24  
**Version:** 2.0  
**Status:** Active
