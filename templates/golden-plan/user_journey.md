# User Journey: [Primary Persona]

## Overview
[Brief description of the main user flow]

## Steps

1. **Landing** → User arrives at `/` → Sees value proposition and CTA to sign up/login
2. **Authentication** → User clicks "Get Started" → Redirected to `/auth` → Creates account or logs in
3. **Dashboard** → After login → User sees `/dashboard` → Overview of their items and quick actions
4. **Create** → User clicks "New Item" → Navigates to `/items/new` → Fills form and saves
5. **Edit** → User clicks existing item → Opens `/items/:id` → Modifies and saves changes
6. **Complete** → User finishes task → Sees success feedback → Returns to dashboard

## Success Metrics
- User can create an item in under 2 minutes
- User understands status at all times
- Error messages are clear and actionable

## Edge Cases
- Empty state: First-time user with no items
- Error state: Save fails due to validation
- Offline state: User loses connection mid-edit



