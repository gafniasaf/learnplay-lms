# Messaging System - Acceptance Criteria

## Overview
This document defines the acceptance criteria for the messaging system, which allows teachers to communicate with students and vice versa.

## Database Schema

### Tables

#### `messages`
- `id` (uuid, primary key)
- `sender_id` (uuid, not null) - References sender user
- `recipient_id` (uuid, not null) - References recipient user
- `content` (text, not null) - Message content
- `created_at` (timestamp, default now())
- `read_at` (timestamp, nullable) - When message was read

### RLS Policies

#### `messages` policies:
- `users can send messages`: Users can insert messages where they are the sender
- `users can view their messages`: Users can view messages where they are sender or recipient
- `users can mark received messages as read`: Users can update read_at for messages they received

## API Endpoints

### 1. Send Message
**Endpoint:** `send-message`  
**Method:** POST  
**Auth:** Authenticated user

**Input:**
```json
{
  "recipientId": "uuid",
  "content": "message text"
}
```

**Output:**
```json
{
  "success": true,
  "message": {
    "id": "uuid",
    "sender_id": "uuid",
    "recipient_id": "uuid",
    "content": "message text",
    "created_at": "timestamp"
  }
}
```

**Behavior:**
- Validates user authentication
- Validates input (recipientId and content required)
- Validates content length (1-2000 characters)
- Prevents sending messages to self
- Verifies recipient exists in profiles
- Inserts message into database
- Returns created message

**Error Cases:**
- 401: Not authenticated
- 400: Missing recipientId or content
- 400: Content too short or too long
- 400: Cannot send to yourself
- 404: Recipient not found
- 500: Database error

### 2. List Conversations
**Endpoint:** `list-conversations`  
**Method:** GET  
**Auth:** Authenticated user

**Output:**
```json
{
  "conversations": [
    {
      "id": "partner-user-id",
      "full_name": "Partner Name",
      "role": "student|teacher",
      "lastMessage": "Last message text",
      "lastMessageAt": "timestamp",
      "unreadCount": 3
    }
  ]
}
```

**Behavior:**
- Fetches all messages for current user
- Groups messages by conversation partner
- Calculates unread count per conversation
- Returns most recent message per conversation
- Orders by last message time (newest first)

### 3. List Messages
**Endpoint:** `list-messages`  
**Method:** GET  
**Auth:** Authenticated user

**Query Parameters:**
- `conversationWith` (optional): Filter to specific conversation partner
- `limit` (optional, default: 50): Number of messages per page
- `offset` (optional, default: 0): Offset for pagination

**Output:**
```json
{
  "messages": [
    {
      "id": "uuid",
      "sender_id": "uuid",
      "recipient_id": "uuid",
      "content": "message text",
      "created_at": "timestamp",
      "read_at": "timestamp",
      "sender": {
        "id": "uuid",
        "full_name": "Sender Name",
        "role": "student|teacher"
      },
      "recipient": {
        "id": "uuid",
        "full_name": "Recipient Name",
        "role": "student|teacher"
      }
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0,
  "hasMore": true
}
```

**Behavior:**
- Fetches messages for current user
- If conversationWith specified, filters to that conversation
- Supports pagination via limit/offset
- Orders messages by created_at descending
- Marks messages as read when viewing conversation
- Returns total count and pagination info

## Frontend Components

### 1. Inbox Page (`/messages`)
**Location:** `src/pages/messages/Inbox.tsx`

**Features:**
- **Conversations List (Left Panel):**
  - Shows all conversations
  - Displays partner name and role
  - Shows last message preview
  - Shows unread count badge
  - Highlights selected conversation
  - Click to view conversation

- **Message Thread (Right Panel):**
  - Shows selected conversation messages
  - Messages grouped by sender (left) and receiver (right)
  - Bubble-style chat UI
  - Timestamps for each message
  - Scrollable message area
  - Message input textarea
  - Send button
  - Enter to send (Shift+Enter for new line)
  - "Load Earlier Messages" button for pagination

- **New Message Dialog:**
  - Search for users to message
  - Teachers see students in their org
  - Students see teachers in their org
  - Click user to start conversation

**API Calls:**
- `listConversations()` - Loads conversation list
- `listMessages(partnerId)` - Loads messages for conversation
- `listMessages(partnerId, { limit, offset })` - Pagination
- `sendMessage(recipientId, content)` - Sends message
- `listOrgStudents()` - For teachers to find students

**Realtime Updates:**
- Subscribes to new messages via Supabase realtime
- Automatically refreshes conversations when new message arrives
- Automatically refreshes current thread when new message arrives
- Auto-scrolls to bottom on new messages

**State Management:**
- Conversations list
- Selected conversation
- Messages for selected conversation
- Message input content
- Loading states
- Available users for new messages
- Pagination offset and hasMore flag

## Navigation

### Routes
- `/messages` - Inbox page

### Navigation Links
- Messages link in teacher/student dashboards
- Icon: Mail/Inbox
- Shows unread count badge (future enhancement)

## Security Requirements

### RLS Enforcement
1. **Sending Messages:**
   - Users can only send messages as themselves
   - Cannot forge sender_id
   - Must be authenticated

2. **Viewing Messages:**
   - Users can only view messages where they are sender or recipient
   - Cannot view other users' conversations
   - RLS filters automatically

3. **Marking as Read:**
   - Can only mark messages as read where user is recipient
   - Cannot mark others' messages as read

### Edge Function Security
- All functions verify user authentication
- Input validation on all parameters
- Content length limits enforced
- Recipient verification before sending
- RLS policies prevent unauthorized access

## Acceptance Testing

### Test Case 1: Teacher Starts Conversation with Student
**Steps:**
1. Log in as teacher
2. Navigate to `/messages`
3. Click "New Message"
4. Search for student by name
5. Click student to select
6. Type message and send
7. Verify message appears in thread

**Expected Results:**
- Student appears in search results
- Conversation opens when selected
- Message sends successfully
- Message appears in thread with timestamp
- Conversation appears in sidebar

### Test Case 2: Student Receives and Replies
**Steps:**
1. Log in as student
2. Navigate to `/messages`
3. Verify new conversation appears in sidebar
4. Verify unread count badge shows
5. Click conversation
6. Verify teacher's message appears
7. Type reply and send
8. Verify reply appears in thread

**Expected Results:**
- Conversation visible in sidebar
- Unread badge shows correct count
- Messages display in correct order
- Reply sends successfully
- Conversation updates in real-time

### Test Case 3: Realtime Updates
**Steps:**
1. Open inbox in two browser windows
2. Log in as teacher in window 1
3. Log in as student in window 2
4. Send message from teacher to student
5. Verify student's inbox updates automatically
6. Send reply from student
7. Verify teacher's thread updates automatically

**Expected Results:**
- New messages appear without refresh
- Conversations list updates in real-time
- Unread counts update automatically
- Both users see updates instantly

### Test Case 4: Pagination
**Steps:**
1. Create conversation with 100+ messages
2. Open conversation
3. Verify only 50 most recent messages shown
4. Verify "Load Earlier Messages" button appears
5. Click button
6. Verify next 50 messages load
7. Verify no duplicates

**Expected Results:**
- Initial load shows 50 messages
- Load more button appears when hasMore is true
- Older messages load on click
- Smooth scrolling behavior
- No message duplicates

### Test Case 5: Mark as Read
**Steps:**
1. Send message from teacher to student
2. Log in as student
3. Verify unread count in sidebar
4. Click conversation
5. Wait a moment
6. Refresh page or check database
7. Verify message marked as read

**Expected Results:**
- Unread count shows before opening
- Message marked as read after viewing
- Unread count updates after viewing
- read_at timestamp set in database

### Test Case 6: Input Validation
**Steps:**
1. Try to send empty message
2. Try to send message with only spaces
3. Try to send very long message (>2000 chars)
4. Try to send to non-existent user
5. Try to send to yourself

**Expected Results:**
- Empty message blocked (button disabled)
- Whitespace-only message trimmed/blocked
- Long message rejected with error
- Non-existent user shows error
- Cannot send to self (not in user list)

### Test Case 7: RLS Enforcement
**Steps:**
1. Attempt to query messages table directly
2. Try to view another user's messages
3. Try to mark another user's message as read
4. Try to forge sender_id when sending

**Expected Results:**
- RLS blocks unauthorized queries
- Can only see own messages
- Cannot modify others' messages
- Sender_id set by server, not client

### Test Case 8: Cross-Role Messaging
**Steps:**
1. Verify teacher can message student
2. Verify student can message teacher
3. Verify student cannot see other students in search
4. Verify teacher can see all org students

**Expected Results:**
- Bidirectional messaging works
- Appropriate users appear in search
- Students only see teachers
- Teachers see students in their org

## Manual Testing Commands

### Check RLS Policies
```sql
-- View messages policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'messages';
```

### View Messages
```sql
-- Check messages for a user
SELECT m.*, 
       s.full_name as sender_name,
       r.full_name as recipient_name
FROM messages m
JOIN profiles s ON s.id = m.sender_id
JOIN profiles r ON r.id = m.recipient_id
WHERE m.sender_id = '[user-id]' OR m.recipient_id = '[user-id]'
ORDER BY m.created_at DESC
LIMIT 20;
```

### Check Unread Messages
```sql
-- Count unread messages for a user
SELECT COUNT(*) as unread_count
FROM messages
WHERE recipient_id = '[user-id]'
  AND read_at IS NULL;
```

### Test Realtime
```sql
-- Enable realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Verify realtime is enabled
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
```

## Edge Function Logs to Monitor

### send-message logs should show:
- Request received with recipientId and content
- Auth check passed
- Input validation passed
- Recipient verification succeeded
- Message inserted
- Response sent

### list-conversations logs should show:
- Request received
- Auth check passed
- Messages fetched and grouped
- Conversation count
- Response sent

### list-messages logs should show:
- Request received with optional conversationWith
- Auth check passed
- Pagination parameters
- Messages fetched
- Messages marked as read (if viewing conversation)
- Response sent with count and pagination info

## Success Criteria

✅ Teacher can send message to student  
✅ Student can send message to teacher  
✅ Both users see message thread  
✅ Messages display in chronological order  
✅ Pagination works (50 messages per page)  
✅ "Load Earlier Messages" button appears when needed  
✅ Messages marked as read when viewed  
✅ Unread count displays correctly  
✅ Realtime updates work (no refresh needed)  
✅ New message dialog shows appropriate users  
✅ Search filters users by name  
✅ RLS blocks unauthorized access  
✅ Cannot send to yourself  
✅ Content validation works (length limits)  
✅ Recipient verification prevents errors  
✅ Timestamps display correctly  
✅ UI is responsive and intuitive  

## Performance Considerations

- **Conversations List:** Fetches recent messages only (500 limit)
- **Message Thread:** Paginated at 50 messages per load
- **Realtime:** Subscribes only to messages for current user
- **Database Queries:** Indexed on sender_id and recipient_id
- **Caching:** Consider caching conversations list
- **Optimization:** Use list-conversations endpoint for sidebar

## Future Enhancements

- [ ] Message search functionality
- [ ] File attachments
- [ ] Message reactions/emoji
- [ ] Typing indicators
- [ ] Read receipts (seen timestamp)
- [ ] Group messaging
- [ ] Message deletion
- [ ] Message editing
- [ ] Push notifications
- [ ] Email notifications
- [ ] Conversation archiving
- [ ] Block/report functionality

## Implementation Status

✅ Database schema with RLS policies  
✅ send-message edge function  
✅ list-messages edge function with pagination  
✅ list-conversations edge function  
✅ Inbox UI with conversations and threads  
✅ Realtime updates via Supabase  
✅ Message input with validation  
✅ New message dialog with user search  
✅ Pagination with "Load More" button  
✅ Mark as read functionality  
✅ Routes and navigation configured  
✅ API functions in src/lib/api.ts  

## Notes

- Messages limited to 2000 characters
- Pagination at 50 messages for performance
- Realtime updates automatic via Supabase channels
- RLS ensures security at database level
- Teachers can only message students in their org
- Students can only message teachers in their org
- Messages cannot be edited or deleted (future feature)
- Conversations automatically created on first message
