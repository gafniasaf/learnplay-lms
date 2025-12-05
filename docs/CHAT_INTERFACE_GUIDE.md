# Chat Interface Guide - Conversational Course Studio

## Overview

The Conversational Course Studio uses a chat-first interface where teachers interact with an AI assistant to create, modify, and refine courses through natural conversation.

---

## **Key Components Built**

### **1. Chat Types** (`src/lib/types/chat.ts`)
- `ChatMessage` - Message structure with role, content, metadata, actions
- `PreviewCourse` - In-memory preview state with cost tracking
- `ChatAction` - Interactive buttons in messages
- `QuickAction` - Pre-defined prompts
- `PreviewUpdate` - Changes to preview state

### **2. ChatPanel** (`src/components/admin/ChatPanel.tsx`)
- Message list with auto-scroll
- User/Assistant/System message styling
- Avatar display
- Metadata badges (cost, duration, provider)
- Action buttons
- Loading indicator
- Error states
- Relative timestamps

### **3. ChatInput** (`src/components/admin/ChatInput.tsx`)
- Textarea with auto-resize
- Quick action buttons
- Character count
- Send on Enter (Shift+Enter for new line)
- Keyboard shortcuts display
- Disabled states

### **4. useCoursePreview Hook** (`src/hooks/useCoursePreview.ts`)
- In-memory preview state management
- Initialize from AI generation
- Load existing course
- Apply updates from chat
- Cost tracking
- Generation history
- Preview statistics

### **5. chat-course-assistant Edge Function** (`supabase/functions/chat-course-assistant/index.ts`)
- OpenAI GPT-4 integration
- Function calling support
- System prompt for educational context
- Cost estimation
- Preview-before-publish workflow

---

## **How It Works**

### **1. User Sends Message**
```typescript
User types: "Create a course about the liver for grade 6"
↓
ChatInput captures input
↓
Calls onSend(message)
↓
Sent to chat-course-assistant edge function
```

### **2. AI Processes Request**
```typescript
Edge function receives message
↓
Adds to conversation history
↓
Sends to OpenAI with system prompt + functions
↓
OpenAI calls function (e.g., generate_course_preview)
↓
Returns response with actions/cost
```

### **3. Preview Updates**
```typescript
AI response includes previewUpdates
↓
useCoursePreview.applyPreviewUpdates()
↓
In-memory preview state updated
↓
Preview panel re-renders
↓
User sees changes immediately
```

### **4. User Approves**
```typescript
User clicks [Approve] action button
↓
Triggers publish workflow
↓
Upload media to Storage
↓
Save course JSON
↓
Update catalog
↓
Mark as published
```

---

## **Message Flow Diagram**

```
User Input
    ↓
ChatInput
    ↓
Parent Component (Course Studio)
    ↓
chat-course-assistant (Edge Function)
    ↓
OpenAI GPT-4 + Function Calling
    ↓
Function Execution (generate/modify/estimate)
    ↓
ChatResponse with actions/updates
    ↓
Update Preview State (in-memory)
    ↓
ChatPanel displays response
    ↓
Preview Panel shows changes
    ↓
User approves → Publish to Database
```

---

## **Chat Functions Available**

### **1. generate_course_preview**
```
User: "Create a course about X"
AI: Calls generate_course_preview
Returns: Plan with cost estimate + approval actions
```

### **2. modify_item**
```
User: "Make item 5 easier"
AI: Calls modify_item(item_id: 5, make_easier: true)
Returns: Preview update + approval actions
```

### **3. estimate_cost**
```
User: "How much will 10 images cost?"
AI: Calls estimate_cost(images: 10)
Returns: Cost breakdown
```

---

## **Quick Actions**

Pre-defined prompts for common tasks:

1. **Create Basic Course** - "Create a course with 12 exercises, no multimedia"
2. **Create Rich Course** - "Create a course with study texts, images, and videos"
3. **Make Easier** - "Make this course easier for students"
4. **Add More Images** - "Add images to exercises that need them"
5. **Add Hints** - "Add helpful hints to all exercises"
6. **Review Quality** - "Review this course and suggest improvements"

---

## **Cost Tracking**

Every operation tracks cost:

```typescript
{
  totalCost: 0.56,
  costBreakdown: {
    text_generation: 0.12,  // OpenAI text
    images: 0.32,            // 8 images × $0.04
    audio: 0.045,            // 3,000 chars × $0.015/1K
    video: 0.25,             // 1 video
  }
}
```

Displayed in:
- Message metadata badges
- Preview stats panel
- Publish confirmation

---

## **Publish Workflow**

### **Before Publish**:
- ✅ Preview generated
- ✅ All media in preview URLs (temp)
- ✅ Course structure validated
- ❌ Nothing in database yet

### **Publish Action**:
1. Upload all preview media to permanent Storage
2. Replace preview URLs with permanent URLs
3. Insert `media_assets` records
4. Save course JSON to Storage
5. Update catalog
6. Mark preview as published

### **After Publish**:
- ✅ Course live at `/play/{id}`
- ✅ Media persisted
- ✅ Catalog updated
- ✅ Preview can be cleared

---

##  **Example Conversations**

### **Conversation 1: Basic Creation**
```
👤: Create a course about fractions for grade 3

🤖: I'll create a fractions course for grade 3 students!

How many exercises would you like?
- Light: 8-10 exercises
- Standard: 12-16 exercises
- Comprehensive: 20-24 exercises

Also, should I include:
- Visual diagrams (pizza slices, number lines)?
- Interactive exercises?
- Study texts explaining concepts?

[Light (12 ex)] [Standard (16 ex)] [Comprehensive (24 ex)]

👤 clicks: [Standard (16 ex)]

🤖: Perfect! Here's my plan:

📚 Study Texts (2):
   - "What are Fractions?" (diagrams)
   - "Adding Fractions" (step-by-step)

📝 Exercises (16 items):
   - Group 1: Basics (6 items + 2 Visual MCQ)
   - Group 2: Operations (6 items)
   - Group 3: Word Problems (4 items)

🎨 Multimedia (6 images):
   - Provider: DALL-E 3
   - Cost: $0.24
   - Time: ~5 minutes

[Generate Preview] [Customize More] [Start Over]
```

### **Conversation 2: Iterative Refinement**
```
👤: The fractions are too abstract

🤖: I'll make them more concrete! I'll:

1. Add real-world examples (pizza, chocolate bars)
2. Replace abstract diagrams with photos
3. Add visual fraction models to all items
4. Simplify language

This adds 4 new images:
Cost: $0.16 (total: $0.40)

[Apply Changes] [Show Me First] [Different Approach]

👤 clicks: [Apply Changes]

🤖: ✅ Changes applied!
- 4 new concrete example images added
- Language simplified to grade 2 level
- Visual models added

Preview updated. Check items 1-4 on the right →
```

---

## **Keyboard Shortcuts**

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `Esc` | Close chat panel |
| `Ctrl+K` | Focus chat input |
| `↑` | Edit last message (future) |

---

## **Best Practices**

### **For Users**:
1. Be specific: "Create a grade 5 photosynthesis course with 12 items"
2. Review costs before approving
3. Iterate in preview before publishing
4. Use quick actions for common tasks

### **For Developers**:
1. Keep chat responses concise (< 300 words)
2. Always show cost before media generation
3. Offer alternatives (cheaper/faster)
4. Validate input before function calls
5. Handle errors gracefully with retry options

---

## **Future Enhancements**

### **Phase 2**:
- Voice input
- Image upload via chat
- Streaming responses (typewriter effect)
- Context-aware suggestions
- Multi-turn conversations with memory

### **Phase 3**:
- Reference existing courses in chat
- Duplicate detection
- Curriculum alignment suggestions
- Collaborative editing (multiple users chat)

---

## **Testing**

### **Unit Tests**:
- ✅ ChatPanel rendering
- ✅ Message styling
- ✅ Action buttons
- ✅ Metadata display

### **E2E Tests**:
- Chat-based course creation workflow
- Multi-turn conversations
- Preview updates
- Publish flow
- Error handling

---

## **Deployment**

The chat interface requires:

**Environment Variables**:
- `OPENAI_API_KEY` - For AI assistant

**Edge Functions**:
- `chat-course-assistant` - Main chat endpoint

**Database Tables**:
- No new tables (uses existing preview state)

---

**Last Updated:** 2025-10-24  
**Status:** Foundation Complete  
**Next**: UI integration into Course Studio

