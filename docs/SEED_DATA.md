# Seed Data Documentation

## Overview

The `supabase/seed.sql` file provides comprehensive demo data for non-production environments. It is **idempotent** and can be safely re-run multiple times.

## Demo Accounts

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Admin | `admin@demo.academy` | `Demo123!` | Superadmin access |
| Teacher | `teacher@demo.academy` | `Demo123!` | Org admin for Demo Academy |
| Student | `alice@demo.student` | `Demo123!` | Active learner, linked to John Smith |
| Student | `bob@demo.student` | `Demo123!` | Active learner, linked to Mary Jones |
| Student | `charlie@demo.student` | `Demo123!` | Has overdue assignment |
| Parent | `john.smith@demo.parent` | `Demo123!` | Alice's parent |
| Parent | `mary.jones@demo.parent` | `Demo123!` | Bob's parent |

## Demo Data Included

### Organization
- **Demo Academy** - Single demo organization with all users

### Courses (3)
1. **Algebra Fundamentals** - Middle School, Mathematics, Algebra
2. **Biology Basics** - High School, Science, Biology
3. **Creative Writing** - Elementary, Language Arts, Writing, Creativity

### Class
- **Ms. Johnson's Class** - Contains all 3 students

### Assignments (3)
1. **Algebra Quiz 1** - Due in 3 days, assigned to all students
2. **Cell Structure Review** - Due in 5 days, assigned to Alice & Bob
3. **Short Story Draft** - Overdue by 2 days, assigned to Charlie

### Achievements
- **Alice**: "Week Warrior" (earned), "Perfect 10" (70% progress)
- **Bob**: "First Steps" (earned)

### Timeline Events (2 weeks)
- Alice: 4 events (assignment completion, badge, login, course start)
- Bob: 3 events (assignment completion, badge, class join)
- Charlie: 2 events (course start, login)

## Usage

### Initial Load

```sql
-- Run the seed file
\i supabase/seed.sql
```

Or via Supabase CLI:
```bash
supabase db reset --local
```

### Reset and Reload

```sql
-- Reset all seed data
SELECT reset_seed_data();

-- Reload (re-run the seed file)
\i supabase/seed.sql
```

### Testing Individual Features

```typescript
// Test student login
import { supabase } from '@/integrations/supabase/client';

const { data, error } = await supabase.auth.signInWithPassword({
  email: 'alice@demo.student',
  password: 'Demo123!',
});
```

## Idempotency

The seed file uses several strategies to ensure idempotency:

1. **User Creation**: Checks if user exists before creating
2. **ON CONFLICT DO NOTHING**: For profiles, roles, relationships
3. **ON CONFLICT DO UPDATE**: For courses (to refresh tags/metadata)
4. **Idempotency Keys**: For events to prevent duplicates
5. **UUIDs**: Fixed UUIDs for organization, class, assignments

## Architecture

```
Organizations
  └─ Demo Academy (org_id: 00000000-0000-0000-0000-000000000001)
      ├─ Teacher: Ms. Johnson
      ├─ Students: Alice, Bob, Charlie
      └─ Classes
          └─ Ms. Johnson's Class
              ├─ Assignment 1: Algebra Quiz
              ├─ Assignment 2: Biology Review
              └─ Assignment 3: Writing Draft

Parent-Child Links
  ├─ John Smith → Alice
  └─ Mary Jones → Bob

Courses
  ├─ algebra-fundamentals (Mathematics, Middle School)
  ├─ biology-basics (Science, High School)
  └─ creative-writing (Language Arts, Elementary)
```

## Customization

To add more seed data, follow these patterns:

### Add a Course
```sql
INSERT INTO course_metadata (id, organization_id, visibility, tags, tag_ids)
VALUES (
  'my-course-id',
  '00000000-0000-0000-0000-000000000001'::uuid,
  'org',
  jsonb_build_object('domain', jsonb_build_array('domain-slug')),
  ARRAY(SELECT id FROM tags WHERE slug = 'domain-slug')
)
ON CONFLICT (id) DO UPDATE SET tags = EXCLUDED.tags;
```

### Add an Assignment
```sql
DO $$
DECLARE
  v_teacher_id uuid;
BEGIN
  SELECT id INTO v_teacher_id FROM auth.users WHERE email = 'teacher@demo.academy';
  
  INSERT INTO assignments (id, org_id, course_id, title, created_by, due_at)
  VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001'::uuid,
    'course-id',
    'Assignment Title',
    v_teacher_id,
    now() + interval '7 days'
  );
END $$;
```

### Add Timeline Events
```sql
INSERT INTO events (user_id, session_id, event_type, event_data, idempotency_key, created_at)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'alice@demo.student'),
  gen_random_uuid(),
  'perfect_score',
  '{"course_id": "algebra-fundamentals", "score": 100}'::jsonb,
  'unique-key-here',
  now()
)
ON CONFLICT (idempotency_key) DO NOTHING;
```

## Security Notes

⚠️ **NEVER run this seed file in production!**

- All passwords are hardcoded (`Demo123!`)
- UUIDs are predictable
- RLS policies may allow unauthorized access for demo accounts
- This is for development/testing only

## Troubleshooting

### Error: "User already exists"
This is normal - the seed file is idempotent and will skip existing users.

### Error: "RLS policy violation"
Ensure RLS policies allow the demo users to perform actions. Check that organization memberships are correctly set.

### Reset not working
Run migrations first to ensure all tables exist:
```bash
supabase db reset --local
```

## Related Documentation

- [Admin Tag API](./ADMIN_TAG_API.md) - Tag management
- [API Tests](./API_TESTS.md) - Testing with seed data
- [Play Session API](./PLAY_SESSION_API.md) - Session testing
