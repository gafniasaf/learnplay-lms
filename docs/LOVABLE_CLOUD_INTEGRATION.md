# Lovable Cloud Integration Guide

## Overview

This project uses **Lovable Cloud**, a full-stack cloud platform that provides seamless backend capabilities powered by Supabase's open-source technology. Lovable Cloud eliminates the need for manual backend setup while providing enterprise-grade database, authentication, storage, and serverless functions.

## What is Lovable Cloud?

Lovable Cloud is an integrated backend solution that automatically provisions and manages a complete Supabase infrastructure for your project. It provides:

- **Automatic Provisioning**: Backend infrastructure is created automatically when you enable Lovable Cloud
- **Zero Configuration**: No need to create external accounts or manage separate services
- **Bidirectional Sync**: Automatic deployment of code changes to your backend
- **Production-Ready**: Scales from prototype to millions of users
- **Usage-Based Pricing**: Pay only for what you use with generous free tiers

## Architecture

### Project Configuration

**Project ID**: `grffepyrmjihphldyfha`

The project uses a Supabase-powered backend with the following structure:

```
project/
├── src/
│   ├── integrations/supabase/
│   │   ├── client.ts          # Auto-generated Supabase client
│   │   └── types.ts            # Auto-generated TypeScript types
│   └── lib/
│       ├── api/                # API client modules
│       └── supabase.ts         # Auth utilities
├── supabase/
│   ├── functions/              # Edge Functions (serverless backend)
│   ├── migrations/             # Database schema migrations
│   └── config.toml             # Supabase configuration
└── docs/                       # Documentation
```

## Core Capabilities

### 1. Database Management

Lovable Cloud provides a PostgreSQL database with automatic schema generation and management.

#### Current Schema

The project includes the following tables:
- `profiles` - User profile information
- `organizations` - Organization/school entities
- `organization_users` - User-organization membership with roles
- `classes` - Class/group management
- `class_members` - Student-class relationships
- `class_join_codes` - Invite codes for joining classes
- `assignments` - Assignment/homework tracking
- `assignment_assignees` - Assignment distribution (students/classes)
- `game_sessions` - Learning game sessions
- `game_rounds` - Individual game rounds
- `game_attempts` - Student answer attempts
- `events` - Analytics and event logging
- `messages` - In-app messaging system
- `parent_children` - Parent-student relationships
- `child_codes` - Parent linking codes
- `pending_invites` - Email invitations

#### Database Migrations

All database changes are managed through SQL migrations:

```sql
-- Example: Creating a new table with RLS
CREATE TABLE public.my_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read own data"
  ON public.my_table
  FOR SELECT
  USING (auth.uid() = user_id);
```

**Key Guidelines**:
- Never modify `auth`, `storage`, `realtime`, or other reserved schemas
- Use validation triggers instead of CHECK constraints for time-based validations
- Always enable RLS on tables containing user data
- Use `SECURITY DEFINER` functions for complex authorization logic

### 2. Authentication & Authorization

#### Built-in Authentication

The project uses Supabase Auth with the following features:
- Email/password authentication
- Auto-confirm email signups (enabled for development)
- Anonymous authentication (for demo purposes)
- Session management with automatic token refresh

#### Authentication Flow

```typescript
import { supabase } from "@/integrations/supabase/client";

// Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'secure-password',
});

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'secure-password',
});

// Get current session
const { data: { session } } = await supabase.auth.getSession();
```

#### Role-Based Access Control

The project implements a secure role system using:

**Available Roles**:
- `student` - Default role for learners
- `teacher` - Educators who manage classes and assignments
- `parent` - Parents monitoring children's progress
- `school_admin` - Organization administrators
- `admin` - Platform administrators

**Security Model**:
```sql
-- Helper function for role checking
CREATE FUNCTION user_has_org_role(_user_id uuid, _org_id uuid, _roles text[])
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_users
    WHERE user_id = _user_id
      AND org_id = _org_id
      AND org_role = ANY(_roles)
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Usage in RLS policies
CREATE POLICY "Teachers manage assignments"
  ON assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_users
      WHERE org_id = assignments.org_id
        AND user_id = auth.uid()
        AND org_role = ANY(ARRAY['school_admin', 'teacher'])
    )
  );
```

**Critical Security Rule**: Never store roles in client-side storage or check permissions client-side. Always enforce authorization in:
1. Row Level Security policies
2. Edge Functions
3. Database functions with `SECURITY DEFINER`

### 3. Edge Functions (Serverless Backend)

Edge Functions provide serverless backend logic deployed globally with automatic scaling.

#### Current Edge Functions

The project includes 37 edge functions organized by domain:

**Course Management**:
- `list-courses` - Fetch available courses from catalog
- `get-course` - Get detailed course data
- `author-course` - Create/edit courses
- `generate-course` - AI-powered course generation
- `review-course` - AI-powered course review
- `apply-course-patch` - Apply AI-suggested changes
- `update-catalog` - Update course catalog index

**Class & Organization**:
- `create-class` - Create new class
- `list-classes` - List user's classes
- `add-class-member` - Add student to class
- `remove-class-member` - Remove student from class
- `generate-class-code` - Generate join code
- `join-class` - Join class via code
- `get-class-roster` - Get class member list
- `list-org-students` - List organization students

**Assignments**:
- `create-assignment` - Create new assignment
- `list-assignments` - List teacher assignments
- `list-assignments-student` - List student assignments
- `assign-assignees` - Assign to students/classes
- `get-assignment-progress` - Track assignment completion

**Game/Learning Sessions**:
- `game-start-round` - Start learning round
- `game-log-attempt` - Log student answer
- `game-end-round` - Complete round with scoring

**Analytics & Reporting**:
- `get-dashboard` - Role-specific dashboard data
- `get-analytics` - Student performance analytics
- `get-class-progress` - Class-wide progress tracking
- `export-analytics` - Export analytics data
- `export-gradebook` - Export gradebook CSV
- `log-event` - Log analytics events
- `list-students-for-course` - List students taking course

**Messaging**:
- `list-conversations` - List user conversations
- `list-messages` - Get conversation messages
- `send-message` - Send message

**Parent Features**:
- `create-child-code` - Generate parent link code
- `link-child` - Link parent to child account
- `invite-student` - Email invitation to students

**Debug/Admin**:
- `debug-catalog` - Debug catalog storage
- `debug-storage` - Debug storage buckets

#### Edge Function Structure

All edge functions follow this pattern:

```typescript
// supabase/functions/my-function/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { withCors, newReqId } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";

serve(withCors(async (req) => {
  const reqId = req.headers.get("x-request-id") || newReqId();

  // Initialize Supabase client
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization")! },
      },
    }
  );

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) {
    return Errors.invalidAuth(reqId);
  }

  // Parse request body
  const body = await req.json();

  // Business logic here...

  // Return response (withCors handles CORS headers automatically)
  return { ok: true, data: result };
}));
```

#### CORS Configuration

All functions use the centralized CORS wrapper (`supabase/functions/_shared/cors.ts`):

```typescript
// withCors automatically handles:
// - OPTIONS preflight requests
// - Access-Control-Allow-Origin (echoes request origin or *)
// - Access-Control-Allow-Headers
// - Access-Control-Allow-Credentials
// - Security headers (CSP, X-Content-Type-Options, etc.)
```

**Important**: All functions have `verify_jwt = false` in `config.toml` because they handle authentication manually via the Authorization header.

#### Calling Edge Functions

From the frontend:

```typescript
import { supabase } from "@/integrations/supabase/client";

// Call edge function
const { data, error } = await supabase.functions.invoke('my-function', {
  body: { payload: 'data' }
});
```

**Never use direct HTTP calls** - always use the Supabase client's `invoke()` method.

### 4. File Storage

The project uses Supabase Storage for file management with two buckets:

#### Storage Buckets

**courses** (Public):
- Stores course content (JSON files)
- Publicly readable
- Used for course catalog system
- HTTP caching enabled via Cache-Control headers

**analytics** (Private):
- Stores exported analytics and gradebooks
- RLS-protected
- Only accessible to authorized teachers/admins

#### Storage Usage Example

```typescript
// Upload file
const { data, error } = await supabase.storage
  .from('courses')
  .upload('path/to/file.json', file, {
    cacheControl: '3600',
    upsert: true
  });

// Get public URL
const { data } = supabase.storage
  .from('courses')
  .getPublicUrl('path/to/file.json');

// List files
const { data, error } = await supabase.storage
  .from('courses')
  .list('path/', {
    limit: 100,
    offset: 0,
  });
```

### 5. Secrets Management

Lovable Cloud provides secure secrets management for API keys and credentials.

#### Configured Secrets

The project has the following secrets configured:
- `ADMIN_UPLOAD_KEY` - Admin course upload authorization
- `SENTRY_DSN` - Error tracking
- `SUPABASE_SERVICE_ROLE_KEY` - Elevated database access
- `SUPABASE_DB_URL` - Direct database connection
- `ALLOWED_ORIGINS` - CORS origin whitelist
- `ALLOW_ALL_ORIGINS` - CORS wildcard toggle

#### Using Secrets in Edge Functions

```typescript
// Access secrets via environment variables
const apiKey = Deno.env.get("MY_API_KEY");
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Never log secrets
console.log("Using API key"); // ✅ Good
console.log("API key:", apiKey); // ❌ Never do this
```

### 6. Realtime Capabilities

Supabase Realtime allows real-time subscriptions to database changes:

```sql
-- Enable realtime for a table
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
```

```typescript
// Subscribe to changes
const channel = supabase
  .channel('messages')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'messages'
    },
    (payload) => console.log('Change:', payload)
  )
  .subscribe();
```

## Development Workflow

### 1. Database Changes

To modify the database schema:

```typescript
// Lovable AI will use the database migration tool
// which executes SQL and regenerates types automatically
```

Example migration:
```sql
-- Add a new column
ALTER TABLE profiles ADD COLUMN avatar_url TEXT;

-- Add RLS policy
CREATE POLICY "Users update own avatar"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```

After migration:
- Types are automatically regenerated in `src/integrations/supabase/types.ts`
- Changes are deployed automatically
- RLS policies are enforced immediately

### 2. Creating Edge Functions

Lovable AI can create edge functions automatically:

1. Determines if secrets are needed
2. Requests secrets from user if required
3. Creates function in `supabase/functions/<name>/index.ts`
4. Updates `supabase/config.toml` configuration
5. Deploys automatically on next build

### 3. Testing and Debugging

**View Logs**:
```bash
# Lovable provides tools to view edge function logs
# Access via Lovable interface or backend dashboard
```

**Common Debugging Steps**:
1. Check console logs in browser DevTools
2. Review edge function logs in backend dashboard
3. Verify RLS policies aren't blocking access
4. Confirm authentication token is being sent
5. Check CORS headers in Network tab

### 4. Auto-Generated Files

**Never manually edit these files**:
- `src/integrations/supabase/client.ts` - Auto-generated Supabase client
- `src/integrations/supabase/types.ts` - Auto-generated TypeScript types
- `supabase/config.toml` - Managed by Lovable (project_id must stay first line)

These files are automatically updated when you make database changes or configure edge functions.

## Best Practices

### Security

1. **Always Enable RLS**: Every table with user data must have RLS enabled
2. **Use SECURITY DEFINER Carefully**: Only for trusted functions that need elevated privileges
3. **Never Expose Service Role Key**: Only use in edge functions, never in frontend
4. **Validate Input**: Always validate and sanitize user input in edge functions
5. **Use Prepared Statements**: Prevent SQL injection by using Supabase client methods

### Performance

1. **Use Indexes**: Add indexes for frequently queried columns
2. **Limit Results**: Always use pagination for large datasets
3. **Cache Static Content**: Use HTTP caching for course catalog
4. **Optimize Queries**: Use `.select()` to fetch only needed columns
5. **Batch Operations**: Group related database operations

### Code Organization

1. **Modular API Layer**: Keep API calls in `src/lib/api/` modules
2. **Shared Edge Function Code**: Use `supabase/functions/_shared/` for common logic
3. **Type Safety**: Import types from `src/integrations/supabase/types`
4. **Error Handling**: Use consistent error envelopes across all functions
5. **Logging**: Add descriptive logs for debugging

## Common Patterns

### Authenticated API Call

```typescript
import { callEdgeFunctionPost } from "@/lib/api/common";

export async function createClass(name: string, description: string) {
  return callEdgeFunctionPost("create-class", {
    name,
    description
  });
}
```

### RLS Policy for Multi-Tenant Data

```sql
-- Students see only their own data
CREATE POLICY "Students access own data"
  ON student_data
  FOR SELECT
  USING (user_id = auth.uid());

-- Teachers see their organization's data
CREATE POLICY "Teachers access org data"
  ON student_data
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_users
      WHERE user_id = auth.uid()
        AND org_role IN ('teacher', 'school_admin')
        AND org_id = student_data.org_id
    )
  );
```

### Storage with RLS

```sql
-- Create policy for private storage bucket
CREATE POLICY "Users access own files"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'private'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users upload own files"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'private'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

## Deployment

### Automatic Deployment

Lovable Cloud automatically deploys changes when you:
1. Update code in Lovable editor
2. Push to connected GitHub repository (main branch)
3. Create or modify edge functions
4. Run database migrations

**Deployment includes**:
- Edge functions deployment
- Database migrations execution
- Type regeneration
- Configuration updates

### Manual Testing

To test before deployment:
1. Use preview environment in Lovable
2. Test with mock data first
3. Verify RLS policies with different user roles
4. Check edge function logs for errors
5. Test CORS from different origins

## Monitoring & Analytics

### Event Logging

The project logs events for analytics:

```typescript
import { logEvent } from "@/lib/api/analytics";

// Log custom event
await logEvent({
  event_type: 'course_completed',
  event_data: {
    course_id: 'intro-math',
    score: 95,
    time_spent: 1200
  }
});
```

### Error Tracking

Integration with Sentry for error monitoring:
- Automatic error capture
- User context tracking
- Performance monitoring
- Session replay (with PII masking)

## Troubleshooting

### Common Issues

**"Failed to fetch" errors**:
- Check CORS configuration
- Verify edge function is deployed
- Confirm auth token is being sent
- Review edge function logs for errors

**RLS policy blocking access**:
- Verify user has correct role
- Check policy conditions match your use case
- Test with `SECURITY DEFINER` function if needed
- Review auth.uid() is correctly set

**Type errors after schema changes**:
- Refresh Lovable editor
- Types auto-regenerate after migrations
- Check `src/integrations/supabase/types.ts` is updated

**Edge function timeout**:
- Optimize database queries
- Add indexes for slow queries
- Consider caching frequently accessed data
- Break into smaller operations if possible

### Getting Help

1. **Backend Dashboard**: View tables, run queries, check logs
2. **Edge Function Logs**: Debug serverless function issues
3. **Lovable Documentation**: [https://docs.lovable.dev/](https://docs.lovable.dev/)
4. **Supabase Docs**: [https://supabase.com/docs](https://supabase.com/docs) (for technical details)

## Comparison: Lovable Cloud vs. External Supabase

| Feature | Lovable Cloud | External Supabase |
|---------|--------------|-------------------|
| Setup | Automatic | Manual account creation |
| Configuration | Zero-config | Requires env variables |
| Deployment | Automatic | Manual via CLI |
| Type Generation | Automatic | Manual setup needed |
| Secrets Management | Built-in UI | Manual env configuration |
| Monitoring | Integrated dashboard | Separate dashboard |
| Billing | Unified with Lovable | Separate billing |
| Learning Curve | Minimal | Steeper |

## Conclusion

Lovable Cloud provides a powerful, integrated backend solution that eliminates the complexity of managing separate services. By leveraging Supabase's proven technology with Lovable's seamless integration, you can focus on building features rather than configuring infrastructure.

Key advantages:
- **Zero Configuration**: Backend infrastructure provisioned automatically
- **Type Safety**: Automatic TypeScript type generation
- **Security First**: RLS policies and proper authentication built-in
- **Scalable**: Grows from prototype to production
- **Integrated**: Unified development experience

For this LearnPlay platform, Lovable Cloud enables sophisticated features like multi-role access control, real-time game sessions, AI-powered course generation, and comprehensive analytics—all without managing separate backend services.
