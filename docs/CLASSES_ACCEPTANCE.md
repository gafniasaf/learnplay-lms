# Classes Feature - Acceptance Criteria

## ✅ Implementation Complete

### Navigation & Routing
- **Navigation**: Teacher → Classes link exists in `src/config/nav.ts` (line 100-105)
- **Route**: `/teacher/classes` → `Classes.tsx` configured in `src/App.tsx` (line 96)
- **Access**: Restricted to users with `teacher` role

### API Endpoints
All endpoints are owner-based (no org dependency):

1. **create-class** (POST)
   - Input: `{ name: string, description?: string }`
   - Creates class with `owner = auth.uid()`
   - Returns: `{ class: { id, name, description, owner, created_at } }`

2. **list-classes** (GET)
   - Returns classes owned by authenticated user
   - Includes class members with name and email
   - Returns: `{ classes: [...] }`

3. **add-class-member** (POST)
   - Input: `{ classId: uuid, studentEmail: string }`
   - Verifies class ownership
   - Looks up student by email
   - Returns 404 if student not found
   - Returns 403 if not class owner

4. **remove-class-member** (POST)
   - Input: `{ classId: uuid, studentId: uuid }`
   - Verifies class ownership
   - Deletes class membership
   - Returns 403 if not class owner

### Frontend API
Object-based parameters:
```typescript
createClass({ name, description? })
listClasses()
addClassMember({ classId, studentEmail })
removeClassMember({ classId, studentId })
```

### UI Features
- **Class Cards**: Display name, description, member count, created date
- **Roster Drawer**: Sheet component with:
  - Student table (name, email columns)
  - "Add by email" input field at top
  - Remove button for each student
  - Real-time member count
- **Actions**: "Roster" and "Code" buttons on each class card
- **Create Modal**: Name + optional description fields

### Security (RLS Policies)
**classes table:**
- `owners read their classes` - SELECT only owner's classes
- `users create classes` - INSERT with owner = auth.uid()
- `owners update their classes` - UPDATE only owner's classes
- `owners delete their classes` - DELETE only owner's classes

**class_members table:**
- `class owners view members` - SELECT requires class ownership
- `students view own membership` - SELECT own membership
- `class owners manage members` - ALL operations require class ownership

## 🧪 Acceptance Testing

### Test 1: Create Class
1. Navigate to `/teacher/classes` as teacher
2. Click "Create Class"
3. Enter name (required) and description (optional)
4. Submit form
5. ✅ **Expected**: Class appears in grid with correct details

### Test 2: List Classes
1. Login as teacher with existing classes
2. Navigate to `/teacher/classes`
3. ✅ **Expected**: All owned classes displayed with member counts

### Test 3: Add Existing Student
1. Open roster for a class
2. Enter email of existing user account
3. Click "Add"
4. ✅ **Expected**: Student appears in table with name and email

### Test 4: Remove Student
1. Open roster with students
2. Click trash icon next to student
3. Confirm removal
4. ✅ **Expected**: Student removed from roster, member count updates

### Test 5: Student Not Found
1. Open roster
2. Enter email that doesn't exist
3. Click "Add"
4. ✅ **Expected**: Error toast: "Student not found. They may need to create an account first."

### Test 6: RLS - Non-Owner Access
**Database Level:**
1. User A creates a class
2. User B tries to query `classes` table for User A's class
3. ✅ **Expected**: Query returns empty (RLS blocks)

**API Level:**
1. User A creates class with ID `class-123`
2. User B calls `add-class-member` with `classId: class-123`
3. ✅ **Expected**: 403 Forbidden response

### Test 7: Cross-Tab Updates
1. Open Classes page in two browser tabs
2. Add student in tab 1
3. ✅ **Expected**: Tab 2 shows updated member count after refresh

## 🔍 Manual Testing Checklist

- [ ] Create class with name only
- [ ] Create class with name + description
- [ ] List shows all owned classes
- [ ] Member count displays correctly
- [ ] Open roster drawer
- [ ] Add student by email (existing account)
- [ ] Add student by email (non-existent account) → error
- [ ] Remove student from roster
- [ ] Try to access another teacher's class → 403
- [ ] Verify RLS blocks direct database queries

## 🚨 Security Verification

### RLS Policies Active
```sql
-- Verify RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('classes', 'class_members');
-- Expected: rowsecurity = true for both
```

### Owner Isolation
```sql
-- As User A, verify can't see User B's classes
SELECT * FROM classes WHERE owner = 'user-b-id';
-- Expected: Empty result set (RLS blocks)
```

### Endpoint Authorization
```bash
# Test add-class-member without ownership
curl -X POST /functions/v1/add-class-member \
  -H "Authorization: Bearer <user-b-token>" \
  -d '{"classId": "user-a-class-id", "studentEmail": "student@test.com"}'
# Expected: {"error": "forbidden"} with 403 status
```

## 📊 Edge Function Logs to Monitor

Check for these log patterns:
- `[create-class] ✓ Created class {id}`
- `[list-classes] ✓ Returned N classes`
- `[add-class-member] ✓ Added student {id} to class {id}`
- `[remove-class-member] ✓ Removed student {id} from class {id}`
- `[add-class-member] Forbidden - not class owner` (expected for non-owners)
- `[add-class-member] Student not found` (expected for invalid emails)

## 🎯 Success Criteria

All of the following must be true:
1. ✅ Teacher can create classes with name and description
2. ✅ Teacher sees only their owned classes
3. ✅ Teacher can add students by email (if account exists)
4. ✅ Teacher can remove students from roster
5. ✅ Member count updates in real-time
6. ✅ Non-owners receive 403 when attempting to manage another's class
7. ✅ RLS prevents direct database access to other teachers' classes
8. ✅ Student not found returns helpful error message
9. ✅ UI is responsive and provides clear feedback
10. ✅ Navigation link appears for teacher role only
