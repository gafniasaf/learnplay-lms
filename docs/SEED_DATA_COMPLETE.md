# Complete Seed Data Documentation

## Overview

The `scripts/seed-complete-database.ts` script populates the database with comprehensive test data for all dashboards and features. This ensures that when you start manual testing, you'll see real data instead of empty dashboards.

## What Gets Seeded

### Test Accounts

The script creates or updates the following test accounts:

- **teacher@test.local** / `TestTeacher123!` - Teacher account
- **student@test.local** / `TestStudent123!` - Student account 1
- **student2@test.local** / `TestStudent123!` - Student account 2
- **parent@test.local** / `TestParent123!` - Parent account
- **admin@test.local** / `TestAdmin123!` - Admin account

### Courses

Creates 3 courses:
- Math Basics (`math-basics-001`)
- Science Basics (`science-basics-001`)
- English Basics (`english-basics-001`)

### Classes

Creates 1 class:
- **Math Class 101** - Contains both test students

### Assignments

Creates 4 assignments with various due dates:
- **Math Quiz 1** - Due in 3 days
- **Science Homework** - Due in 5 days
- **English Essay** - Overdue (2 days ago)
- **Math Quiz 2** - Due in 7 days

### Student Assignments

Creates student assignment records with different statuses and progress:
- Student 1: 2 in-progress (45%, 30%), 1 not started, 1 not started
- Student 2: 1 completed, 1 in-progress (60%), 1 completed

### Game Activity

Creates realistic game activity for teacher dashboard:
- **8 game sessions** - Spread over last 16 days
- **24 game rounds** - 3 rounds per session
- **100+ game attempts** - With some within last 7 days (for `attempts7d` stat)

### Student Metrics

Creates metrics for both students:
- Student 1: 1250 XP, 5-day streak
- Student 2: 2100 XP, 12-day streak

### Student Achievements

Creates achievements:
- Student 1: "Week Warrior" (5-day streak)
- Student 2: "XP Master" (2000+ XP)

### Student Recommendations

Creates course recommendations:
- Student 1: Recommended English course
- Student 2: Recommended Math course

## Usage

### Running the Seed Script

```bash
npx tsx scripts/seed-complete-database.ts
```

### Prerequisites

The script requires:
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `learnplay.env` or environment variables
- `ORGANIZATION_ID` in `learnplay.env` or environment variables

### Verifying Seed Data

After running the seed script, verify the data was created correctly:

```bash
npx tsx scripts/verify-seed-data.ts
```

This will check:
- All test users exist
- Courses, classes, assignments are created
- Game activity data is present
- Student metrics and achievements exist

## What Each Dashboard Will Show

### Teacher Dashboard

- **Active Classes**: 1 class
- **Total Students**: 2 students
- **Assignments Active**: 4 assignments
- **Game Sessions**: 8 sessions
- **Game Rounds**: 24 rounds
- **Attempts (7d)**: Recent attempts within last 7 days

### Student Dashboard

- **Assignments**: 4 assignments (mix of in-progress, completed, not started)
- **Performance**: XP and streak from metrics
- **Recommended Courses**: Course recommendations

### Parent Dashboard

- **Children**: 2 children (if parent is linked)
- **Total Courses Active**: Count of active assignments
- **Average Accuracy**: Calculated from assignment progress
- **Weekly Minutes**: Estimated from activity count

### Admin Dashboard

- **Total Students**: 2
- **Total Teachers**: 1
- **Active Classes**: 1
- **Courses Published**: 3
- **System Health**: Health check data

## Notes

- The script is **idempotent** - you can run it multiple times safely
- Existing users will have their passwords updated
- Data is linked via `organization_id` - all users belong to the same organization
- Game sessions are created for the teacher account to populate teacher dashboard stats
- Some game attempts are within the last 7 days to ensure the `attempts7d` stat shows data

## Troubleshooting

If dashboards still show empty data:

1. **Verify seed script ran successfully** - Check console output for errors
2. **Run verification script** - `npx tsx scripts/verify-seed-data.ts`
3. **Check organization ID** - Ensure `ORGANIZATION_ID` matches your test accounts
4. **Check Edge Functions** - Ensure Edge Functions are deployed and working
5. **Check RLS policies** - Ensure Row Level Security allows access to the data

## Next Steps

After seeding:
1. Log in as teacher@test.local to see teacher dashboard
2. Log in as student@test.local to see student dashboard
3. Log in as parent@test.local to see parent dashboard (may need to link children first)
4. Log in as admin@test.local to see admin dashboard

