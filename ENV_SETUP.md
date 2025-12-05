# Environment Configuration

## API Mode Switching

This project supports switching between mock data and Supabase backend via an environment variable.

### Setup

1. Create a `.env.local` file in the project root (this file is git-ignored)
2. Add the following configuration:

```env
# API Configuration
# Set to "true" to use mock data, "false" to use Supabase
VITE_USE_MOCK=true

# Supabase Configuration (only needed when VITE_USE_MOCK=false)
# VITE_SUPABASE_URL=your-project-url.supabase.co
# VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

### Usage

**Mock Mode (Default)**
```env
VITE_USE_MOCK=true
```
- Uses local JSON files from `/public/mock/`
- No backend required
- Great for development and testing
- Data is not persisted

**Supabase Mode**
```env
VITE_USE_MOCK=false
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```
- Connects to Supabase backend
- Requires Supabase project setup
- Data is persisted
- Supports authentication and RLS

### API Functions

All API calls now follow the manifest-first pattern:

- Root entity helpers load and persist `ProjectBoard` JSON blobs (current domain).
- Task helpers operate on the embedded `TaskItem` collection within each ProjectBoard.
- Legacy course helpers (e.g., the old course loader) have been fully removed.

### Session Store

The Zustand session store (`src/store/sessionStore.ts`) manages:
- Current session/round IDs
- Course and level metadata
- Session timestamps
- Persists to localStorage

### Implementation Status

**✅ Implemented (Mock)**
- Course loading
- Dashboard loading (all roles)
- Session management (frontend only)
- Attempt logging (mock)
- Round completion (mock)

**🚧 TODO (Supabase)**
- Supabase client setup
- Database schema
- RLS policies
- Edge functions
- Real-time updates

### Testing

To verify the current mode, check browser console:
```
[API] Using mock data for ProjectBoard loader
[Play] Using API mode: mock
```

### Development Workflow

1. Develop features using mock mode
2. Test with different mock data scenarios
3. Switch to Supabase mode for production
4. Implement Supabase-specific logic when ready
