# MES Content Migration Guide

This guide explains how to download and import all ExpertCollege (MES) content into your LearnPlay platform.

## Quick Start: Web Monitor (Recommended)

The easiest way to run and monitor the migration is with the web dashboard:

```powershell
# 1. Setup credentials
cp mes-migration.env.example mes-migration.env
# Edit mes-migration.env with your keys

# 2. Start the web monitor
npx tsx scripts/mes-migration-monitor.ts

# 3. Open in browser
# http://localhost:3847
```

The web monitor provides:
- 🚀 **Start/Stop/Reset buttons** - Control migration with a click
- 📊 **Real-time progress** - Live progress bar with ETA
- 📋 **Live logs** - See what's happening in real-time
- ⚠️ **Error tracking** - View recent errors at a glance
- 🖼 **Image migration toggle** - Choose to include multimedia

![Migration Monitor](./images/migration-monitor.png)

## Alternative: PowerShell Daemon

```powershell
# 1. Setup credentials
cp mes-migration.env.example mes-migration.env
# Edit mes-migration.env with your keys

# 2. Start background migration daemon
.\scripts\mes-migration-daemon.ps1 -Start

# 3. Watch progress in real-time
.\scripts\mes-migration-daemon.ps1 -Watch

# 4. Or check status anytime
.\scripts\mes-migration-daemon.ps1 -Status
```

The daemon runs in the background with:
- ✅ Auto-resume on interruption
- ✅ Auto-restart on crash/hang
- ✅ Real-time progress tracking
- ✅ Checkpoint saving (every course)

## Overview

**Source Database**: Kevin's MES Supabase (`yqpqdtedhoffgmurpped`)
- Contains: Courses, Topics, Exercises, Subjects, Study Texts, Resources
- Key Function: `get_course_content(course_id)` - returns full course structure as JSON
- RLS: Opened for public read access via anon key

**Multimedia**: Azure Blob Storage
- Base URL: `https://expertcollegeresources.blob.core.windows.net/assets-cnt/`
- Contains: Images, HTML5 animations, videos

**Target**: Your LearnPlay Supabase
- Storage: `courses/{id}/course.json`
- Database: `course_metadata` table

## Source Schema

The MES database contains these key tables:

| Table | Description |
|-------|-------------|
| `mes_course` | Course metadata (name, language, type) |
| `mes_topic` | Hierarchical topic structure |
| `mes_topicexercise` | Topic ↔ Exercise junction |
| `mes_exercise` | Exercise questions with metadata |
| `mes_subject` | Hierarchical subject structure |
| `mes_subjectstudytext` | Subject ↔ StudyText junction |
| `mes_studytext` | Study text materials |
| `mes_resource` | Content resources (HTML with embedded images) |

The `get_course_content(course_id)` function returns:
```json
{
  "course": [{ "id": 169, "name": "Course Name", "category": "...", "image": "..." }],
  "topics": [{ "mes_topic_id": 1, "mes_exercise_id": 123, ... }],
  "subjects": [{ "mes_subject_id": 1, "mes_studytext_id": 456, "study_text": "<html>..." }]
}
```

## Quick Start

### 1. Setup Environment

```bash
# Copy the example env file
cp mes-migration.env.example mes-migration.env

# Edit with your credentials
notepad mes-migration.env  # or code mes-migration.env
```

Required variables:
```env
# Your LearnPlay Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ORGANIZATION_ID=your-org-uuid
```

### 2. List Available Courses

```bash
npx tsx scripts/migrate-mes-content.ts --list
```

Output:
```
📋 Courses in MES database:

  ID     | Language | Name
  ──────────────────────────────────────────────────────────────
    169 | nl       | Anatomie & Fysiologie
    170 | nl       | Pathologie
    171 | nl       | Verpleegtechnisch handelen
  ...

  Total: 150 courses
```

### 3. Test with a Single Course

```bash
# Dry run (preview without saving)
npx tsx scripts/migrate-mes-content.ts --courseId=169 --dry-run

# Actually migrate
npx tsx scripts/migrate-mes-content.ts --courseId=169
```

### 4. Batch Migration

```bash
# Migrate first 10 courses
npx tsx scripts/migrate-mes-content.ts --batch=10

# Migrate ALL courses
npx tsx scripts/migrate-mes-content.ts --all

# Resume if interrupted
npx tsx scripts/migrate-mes-content.ts --all --resume
```

### 5. Include Images (Optional)

```bash
# Migrate courses WITH images from Azure Blob Storage
npx tsx scripts/migrate-mes-content.ts --all --migrate-images
```

## CLI Options

| Option | Description |
|--------|-------------|
| `--list` | List all courses in MES database |
| `--courseId=ID` | Migrate a single course by ID |
| `--batch=N` | Migrate first N courses |
| `--all` | Migrate all courses |
| `--resume` | Resume from last checkpoint |
| `--migrate-images` | Download images from Azure and upload to Supabase |
| `--dry-run` | Preview without saving |
| `--locale=nl` | Set locale (default: nl for Dutch) |

## What Gets Migrated

### ✅ Included

1. **Courses** - Title, description, metadata
2. **Topics** - Hierarchical structure preserved
3. **Exercises** - Questions, options, correct answers
4. **Study Texts** - HTML content with formatting
5. **Images** - From Azure Blob Storage (with `--migrate-images`)
6. **HTML5 Animations** - URLs preserved in content

### ⚠️ Transformations

- Course IDs: Prefixed with `mes-` (e.g., `mes-169`)
- Images: URLs rewritten if `--migrate-images` used
- Study Text HTML: Converted to marker format with `[IMAGE:...]`, `[ANIMATION:...]`
- Exercises: Parsed from various JSON/XML metadata formats

### ❌ Not Migrated

- User data (students, progress)
- Authentication/sessions
- Flash content (obsolete)

## Web Monitor

The web monitor (`http://localhost:3847`) provides a beautiful dashboard for controlling the migration.

### Starting the Monitor

```powershell
npx tsx scripts/mes-migration-monitor.ts
```

This starts a local web server. Open `http://localhost:3847` in your browser.

### Dashboard Features

| Feature | Description |
|---------|-------------|
| **Status Badge** | Shows IDLE, RUNNING, PAUSED, COMPLETED, or ERROR |
| **Progress Bar** | Visual progress with percentage |
| **Current Course** | Shows which course is being processed |
| **ETA** | Estimated time remaining |
| **Statistics** | Successful, Failed, Items, Study Texts counts |
| **Error Panel** | Recent errors with course IDs |
| **Live Logs** | Real-time log output |

### Control Buttons

| Button | Action |
|--------|--------|
| **▶ Start Migration** | Start migration (metadata only) |
| **🖼 Start + Images** | Start with image migration from Azure |
| **⏹ Stop** | Stop the running migration |
| **🗑 Reset** | Clear all progress and start fresh |

### Auto-Refresh

The dashboard auto-refreshes every 2 seconds, so you can watch progress in real-time without reloading.

---

## PowerShell Daemon (Alternative)

The PowerShell daemon provides the same functionality via command line:

### PowerShell Commands

```powershell
# Start migration in background
.\scripts\mes-migration-daemon.ps1 -Start

# Start with image migration
.\scripts\mes-migration-daemon.ps1 -Start -MigrateImages

# Watch live progress (updates every 2 seconds)
.\scripts\mes-migration-daemon.ps1 -Watch

# Check status once
.\scripts\mes-migration-daemon.ps1 -Status

# Stop the daemon
.\scripts\mes-migration-daemon.ps1 -Stop

# Reset and start fresh
.\scripts\mes-migration-daemon.ps1 -Reset
```

### TypeScript Status Commands

```bash
# Show status once
npx tsx scripts/mes-migration-status.ts

# Live watch mode
npx tsx scripts/mes-migration-status.ts --watch

# Reset checkpoint
npx tsx scripts/mes-migration-status.ts --reset
```

### Daemon Features

| Feature | Description |
|---------|-------------|
| **Auto-Resume** | Continues from last checkpoint automatically |
| **Auto-Restart** | Restarts worker on crash (up to 100 times) |
| **Hang Detection** | Detects hung workers (no heartbeat for 2 min) and restarts |
| **Real-time Progress** | Live progress bar with ETA |
| **Checkpoint** | Saves after every course (no lost work) |
| **Log File** | Full logs in `artifacts/mes-migration.log` |

### View Logs

```powershell
# Tail the log file
Get-Content artifacts\mes-migration.log -Wait -Tail 50
```

## Checkpoint & Recovery

The migration saves progress to `artifacts/mes-migration-checkpoint.json`:

```json
{
  "version": 1,
  "started_at": "2025-12-31T10:00:00Z",
  "updated_at": "2025-12-31T10:30:00Z",
  "last_course_id": 175,
  "stats": {
    "successCount": 6,
    "failedCount": 0,
    "itemsImported": 450,
    "studyTextsImported": 120
  }
}
```

If migration is interrupted, use `--resume` to continue:
```bash
npx tsx scripts/migrate-mes-content.ts --all --resume
```

## Troubleshooting

### Connection Failed

```
❌ Failed to connect to MES database
```

**Cause**: Kevin's Supabase might have changed credentials or RLS policies.

**Solution**: 
1. Verify the anon key is correct
2. Ask Kevin to re-enable RLS public read
3. Try the PostgreSQL connection string instead

### RPC Error

```
⚠️ RPC error for course 169: function get_course_content does not exist
```

**Cause**: The RPC function might not be deployed.

**Solution**: Ask Kevin to verify the function exists in his database.

### Images Not Loading

```
Images failed: 15
```

**Cause**: Some Azure Blob URLs might be expired or moved.

**Solution**: 
1. Check Azure container access
2. Verify blob exists at the URL
3. Some old content might reference non-existent files

## Data Format

Migrated courses are stored in the LearnPlay envelope format:

```json
{
  "id": "mes-169",
  "format": "mes",
  "version": 1,
  "content": {
    "id": "mes-169",
    "title": "Anatomie & Fysiologie",
    "locale": "nl",
    "source": "mes",
    "source_course_id": 169,
    "organization_id": "your-org-id",
    "visibility": "org",
    "groups": [...],
    "items": [...],
    "studyTexts": [...],
    "levels": [...],
    "_import": {
      "sourceSystem": "mes_legacy",
      "sourceCourseId": 169,
      "importedAt": "2025-12-31T10:00:00Z"
    }
  }
}
```

## Access Migrated Content

After migration, courses are accessible via:

### Admin UI
Navigate to `/admin/library-courses` to browse imported content.

### MCP API
```typescript
const courses = await lms.listLibraryCourses({ format: 'mes' });
const course = await lms.getLibraryCourseContent({ id: 'mes-169' });
```

### Direct Storage
```typescript
const { data } = await supabase.storage
  .from('courses')
  .download('mes-169/course.json');
```

## Contact

- **Kevin (ExpertCollege)**: Manages the source MES database
- **Database Connection**: Kevin confirmed access on Dec 26-27, 2024
- **Supabase Project**: `yqpqdtedhoffgmurpped`

