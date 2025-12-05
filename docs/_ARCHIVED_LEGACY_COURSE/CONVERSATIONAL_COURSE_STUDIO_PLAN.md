# Conversational Course Studio - AI-First Design

## **Vision Statement**

Transform course authoring from form-filling and JSON editing into a **natural conversation with an AI assistant** that:
- Understands your educational goals in plain language
- Generates complete preview courses with ALL content (text, images, audio, video)
- Shows you the full course BEFORE any database commits
- Lets you refine via chat ("make this easier", "add more images", "change the style")
- Only publishes to database when you explicitly approve

---

## **Core Principle: Preview-First, Chat-Driven**

### **Traditional Flow (Current)**:
```
1. Fill form → 2. Generate → 3. Edit in separate UI → 4. Save → 5. Preview
```

### **New Flow (Chat-Based)**:
```
1. Chat: "Create a course about the liver for grade 6"
2. AI generates FULL preview (items + study texts + ALL images)
3. You see complete course in preview panel
4. Chat: "Make item 5 easier" or "Add a video to study text 2"
5. AI regenerates affected parts, updates preview
6. You approve → Single publish action → Database commit
```

---

## **New Architecture**

### **Main Layout: Chat Interface**

```
┌─────────────────────────────────────────────────────────────┐
│  Course Studio                        [?] Help  [⚙️] Settings │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌───────────────────────────────┐   │
│  │                 │  │                               │   │
│  │  CHAT           │  │  PREVIEW PANEL                │   │
│  │  PANEL          │  │                               │   │
│  │                 │  │  [Course tabs/accordion]      │   │
│  │  (40% width)    │  │                               │   │
│  │                 │  │  (60% width)                  │   │
│  │                 │  │                               │   │
│  └─────────────────┘  └───────────────────────────────┘   │
│                                                             │
│  [Type your message...                    ] [Send]         │
└─────────────────────────────────────────────────────────────┘
```

---

## **Chat Panel (Left 40%)**

### **Message Types**

**1. User Messages**:
- Plain text requests
- Voice input (future)
- Quick action buttons

**2. AI Responses**:
- Explanatory text
- Loading indicators with progress
- Action cards (approve/modify/regenerate)
- Cost/time estimates
- Warnings and suggestions

**3. System Messages**:
- Generation started
- Preview updated
- Errors/warnings
- Publish confirmation

### **Example Conversation**:

```
👤 User:
"Create a course about liver anatomy for grade 6 students"

🤖 AI:
I'll create a comprehensive liver anatomy course. Here's my plan:

📚 Study Texts: 3 sections
   - Liver Overview (with diagram)
   - Liver Functions (with infographic)
   - Liver Diseases (with comparison images)

📝 Exercises: 12 items across 3 groups
   - Basic anatomy (4 items + 2 Visual MCQ)
   - Functions (4 items + 1 diagram labeling)
   - Clinical (4 items)

🎨 Multimedia: 8 AI-generated images
   Provider: DALL-E 3
   Cost: $0.32
   Time: ~6 minutes

Approve this plan? [Approve] [Modify] [Start Over]

👤 User clicks: [Approve]

🤖 AI:
✨ Generating your course...

[Progress bar: 25%]
✅ Study texts generated
⏳ Generating images (3/8 complete)...

[Progress bar: 60%]
✅ All images generated
⏳ Generating exercises...

[Progress bar: 100%]
✅ Course complete! Preview updated on the right →

You can now:
- Review the preview
- Ask me to make changes
- Publish when ready

👤 User:
"Make item 5 easier and add a video to study text 1"

🤖 AI:
I'll make two changes:

1. Simplify item 5 (liver lobe identification)
   Current difficulty: Grade 6
   New difficulty: Grade 5
   
2. Add video to "Liver Overview" study text
   Provider: Zeroscope
   Duration: 15 seconds
   Cost: $0.25
   
Total: $0.25 • Time: ~3 minutes

Proceed? [Yes] [No] [Show me item 5 first]

👤 User clicks: [Yes]

🤖 AI:
⏳ Updating preview...
✅ Item 5 simplified
✅ Video generated for study text 1
✅ Preview updated!

Changes applied. Anything else?

👤 User:
"Looks perfect! Publish it."

🤖 AI:
📤 Publishing "Liver Anatomy - Grade 6"...

✅ Course saved to database
✅ Catalog updated
✅ Media assets uploaded (9 files)
✅ Live at /play/liver-anatomy-g6

Total cost: $0.57 (8 images + 1 video)

[View Course] [Create Another] [Edit This Course]
```

---

## **Preview Panel (Right 60%)**

### **Tabbed Preview**:

```
[Course Info] [Study Texts] [Exercises] [Media Library] [JSON]

Tab: Study Texts
┌─────────────────────────────────────────┐
│ 📖 Liver Overview                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                         │
│ What is the Liver?                      │
│ [Image: Liver anatomy diagram]          │
│ The liver is the largest internal...   │
│                                         │
│ [Video: Liver function animation]       │
│                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ 📖 Liver Functions                      │
│ ...                                     │
└─────────────────────────────────────────┘

Tab: Exercises
┌─────────────────────────────────────────┐
│ Group 1: Basic Anatomy (4 items)        │
│                                         │
│ Item 1: Which lobe is highlighted?      │
│ [Image stimulus: liver diagram]         │
│ Options: [A] [B] [C] [D]                │
│ Answer: A (Right lobe)                  │
│ ✏️ Edit  🔄 Regenerate Image            │
│                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ Item 2: ...                             │
└─────────────────────────────────────────┘
```

---

## **AI Chat Capabilities (Function Calling)**

### **Core Functions**

```typescript
const chatFunctions = [
  {
    name: "generate_course_preview",
    description: "Generate a complete course preview with all content",
    parameters: {
      subject: string,
      grade: string,
      items_per_group: number,
      include_multimedia: boolean,
      multimedia_preferences: {
        image_provider: 'dalle3' | 'sdxl',
        audio_provider: 'openai-tts' | 'elevenlabs',
        video_enabled: boolean,
      }
    }
  },
  
  {
    name: "modify_item",
    description: "Modify a specific exercise item",
    parameters: {
      item_id: number,
      changes: {
        difficulty?: 'easier' | 'harder',
        text?: string,
        options?: string[],
        add_image?: boolean,
        add_audio?: boolean,
        hint?: string,
      }
    }
  },
  
  {
    name: "regenerate_media",
    description: "Regenerate specific media assets",
    parameters: {
      target: {
        type: 'study_text' | 'item_stimulus' | 'item_option',
        id: string,
      },
      provider?: string,
      style?: string,
      custom_prompt?: string,
    }
  },
  
  {
    name: "add_content",
    description: "Add new content to the course",
    parameters: {
      type: 'study_text' | 'exercise' | 'multimedia',
      details: object,
    }
  },
  
  {
    name: "remove_content",
    description: "Remove content from the course",
    parameters: {
      type: 'study_text' | 'exercise' | 'media',
      id: string,
    }
  },
  
  {
    name: "publish_course",
    description: "Publish the preview course to the database",
    parameters: {
      confirm: boolean,
    }
  },
  
  {
    name: "export_preview",
    description: "Export preview course as JSON",
  },
  
  {
    name: "estimate_cost",
    description: "Estimate cost for planned changes",
    parameters: {
      changes: object,
    }
  },
];
```

---

## **Preview State Management**

### **In-Memory Preview (Not Committed)**:

```typescript
interface PreviewCourse extends CourseV2 {
  // Metadata
  isPreview: true;
  previewId: string;  // UUID for this preview session
  generatedAt: string;
  
  // Cost tracking
  totalCost: number;
  costBreakdown: {
    text_generation: number;
    images: number;
    audio: number;
    video: number;
  };
  
  // Generation provenance
  generationHistory: Array<{
    timestamp: string;
    action: string;
    user_message: string;
    ai_response: string;
    changes: object;
  }>;
  
  // Status
  status: 'generating' | 'complete' | 'error';
  publishable: boolean;
}
```

### **Nothing Touches Database Until Publish**:

```typescript
// Preview flows
generateCoursePreview() -> in-memory state
modifyItem() -> update in-memory state
regenerateMedia() -> update in-memory state
addContent() -> update in-memory state

// Only this commits to database
publishCourse() -> {
  1. Upload all media to Storage
  2. Insert media_assets records
  3. Save course JSON to Storage
  4. Update catalog
  5. Mark as published
}
```

---

## **Chat-First UI/UX Details**

### **Quick Actions (Above Chat Input)**:

```
[+ Add Study Text] [+ Add Exercise] [🎨 Change Style] [💰 Cost Summary]
```

### **Message Bubbles**:

**User Message**:
```
┌─────────────────────────────────────┐
│ Make this course more visual        │
│                          You, 2m ago │
└─────────────────────────────────────┘
```

**AI Response**:
```
┌─────────────────────────────────────────────────────┐
│ AI Assistant                                        │
├─────────────────────────────────────────────────────┤
│ I'll make it more visual by:                        │
│                                                     │
│ 1. Convert 3 text-only items to Visual MCQ         │
│ 2. Add diagrams to all study texts                 │
│ 3. Add image stimulus to 6 items                   │
│                                                     │
│ This will add 15 images:                           │
│ • Provider: DALL-E 3                               │
│ • Cost: $0.60                                      │
│ • Time: ~12 minutes                                │
│                                                     │
│ [Approve Changes] [Show Me First] [Different Style]│
└─────────────────────────────────────────────────────┘
```

**Progress Message**:
```
┌─────────────────────────────────────┐
│ 🔄 Generating images...             │
│ ████████████░░░░░░░░ 60% (9/15)     │
│                                     │
│ Completed:                          │
│ ✅ liver-anatomy.png                │
│ ✅ liver-functions.png              │
│ ⏳ liver-pathology.png (15s)        │
└─────────────────────────────────────┘
```

---

## **Example Chat Sessions**

### **Session 1: Generate New Course**

```
👤: Create a course about photosynthesis for grade 5

🤖: I'll create a photosynthesis course! Let me ask a few questions:

1. How many exercises? (Recommended: 12-16 for grade 5)
2. Should I include multimedia? (Images, diagrams, videos)
3. Any specific topics to emphasize? (e.g., light reactions, Calvin cycle)

[Quick replies: "12 exercises" "Include images" "Standard coverage"]

👤: 12 exercises, include images and one video

🤖: Perfect! Here's what I'll create:

📚 Course: "Photosynthesis - Grade 5"
   
Study Texts (3):
- "What is Photosynthesis?" (diagram + video)
- "The Process" (step-by-step with images)
- "Why It Matters" (infographic)

Exercises (12 items):
- Group 1: Basics (4 MCQ)
- Group 2: Process (4 MCQ + 2 Visual MCQ)
- Group 3: Application (2 MCQ)

Multimedia:
- 6 DALL-E images ($0.24)
- 1 Zeroscope video ($0.25)
- Total: $0.49, ~10 minutes

[Generate Preview] [Modify Plan] [Start Over]

👤 clicks: [Generate Preview]

🤖: ✨ Generating preview...
[Progress updates]
✅ Complete! Preview is ready on the right →

Review the course and let me know what you'd like to change!

👤: The video in study text 1 doesn't show the chloroplast clearly

🤖: I'll regenerate the chloroplast video with better clarity.

Options:
A) Same provider (Zeroscope) with enhanced prompt
B) Wait for better provider (Sora when available)
C) Replace with still image sequence (cheaper, clearer)

Recommendation: Option C - Image sequence
Cost: $0.12 (3 images) vs $0.25 (video)
Quality: Better for educational detail

Which option? [A] [B] [C]

👤 clicks: [C]

🤖: ⏳ Replacing video with image sequence...
✅ Done! Added 3 detailed chloroplast images.
Preview updated.

👤: Perfect! Publish it.

🤖: 📤 Publishing "Photosynthesis - Grade 5"...

✅ All media uploaded (9 files)
✅ Course saved to database
✅ Catalog updated
✅ Live at /play/photosynthesis-g5

Total cost: $0.36
Course ID: photosynthesis-g5

[View Course] [Create Similar] [Share]
```

---

### **Session 2: Edit Existing Course**

```
👤: Load the liver anatomy course

🤖: ✅ Loaded "Liver Anatomy - Grade 6" (v3)

Current status:
- 16 exercises
- 3 study texts
- 8 images, 0 videos
- Last edited: 2 days ago

Preview is ready on the right. What would you like to change?

👤: Item 10 is too hard, students are getting it wrong

🤖: Let me check item 10...

Item 10: "Identify the hepatic portal vein in this diagram"
Current difficulty: Grade 7-8
Success rate: 45% (below target of 70%)

I recommend:
1. Simplify the question text
2. Add a hint
3. Replace complex diagram with simplified version

[Apply Recommendations] [Show Me Options] [Just Add Hint]

👤 clicks: [Apply Recommendations]

🤖: ✅ Updated item 10:
- New text: "Which blood vessel brings nutrients to the liver?"
- Added hint: "Look for the vessel coming from the intestines"
- Regenerating diagram with labels...
⏳ Generating simplified diagram...
✅ Preview updated!

New estimated difficulty: Grade 6
Cost: $0.04 (1 image)

👤: Great! Also add a video showing blood flow

🤖: I'll add a blood flow animation to the study text.

Video Details:
- Provider: Zeroscope (only option currently)
- Duration: 10-15 seconds
- Shows: Blood flow through hepatic portal system
- Cost: $0.25
- Time: ~3 minutes

Note: Video quality is basic. For better quality, I recommend:
- Wait for Sora (coming soon)
- Or use animated image sequence (cheaper, better)

Proceed with Zeroscope? [Yes] [Use Image Sequence] [Cancel]

👤: Use image sequence

🤖: ✅ Creating 4-frame blood flow sequence...
[Progress]
✅ Complete! Added to "Liver Overview" study text.

Total changes: $0.20 (5 images for sequence)
Preview updated.

👤: Publish changes

🤖: 📤 Publishing changes...

✅ Updated "Liver Anatomy - Grade 6" (v3 → v4)
✅ 5 new media files uploaded
✅ Catalog updated

Changes live. Cost: $0.24

[View Course] [More Edits] [View History]
```

---

## **Preview Panel (Right 60%)**

### **Interactive Preview Modes**:

**1. Overview Tab**:
```
┌─────────────────────────────────────┐
│ Liver Anatomy - Grade 6             │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                     │
│ 📊 Course Stats                     │
│ • 16 exercises                      │
│ • 3 study texts                     │
│ • 8 images, 0 videos                │
│ • Est. completion: 25 minutes       │
│                                     │
│ 💰 Generation Cost: $0.32           │
│                                     │
│ [👁️ Preview in Play] [⬇️ Export JSON] │
└─────────────────────────────────────┘
```

**2. Study Texts Tab**:
```
┌─────────────────────────────────────┐
│ 📖 Liver Overview                   │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                     │
│ What is the Liver?                  │
│ [Image: liver-anatomy.png]          │
│ The liver is...                     │
│                                     │
│ [💬 "Simplify this"]                │
│ [🎨 "Add more images"]              │
│ [✏️ Edit Manually]                  │
└─────────────────────────────────────┘
```

**3. Exercises Tab**:
```
┌─────────────────────────────────────┐
│ Item 5: Which lobe is highlighted?  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                     │
│ [Stimulus image preview]            │
│ Q: Which lobe is highlighted?       │
│ A) Right lobe ✅                    │
│ B) Left lobe                        │
│ C) Caudate lobe                     │
│ D) Quadrate lobe                    │
│                                     │
│ Difficulty: ⭐⭐⭐ (Grade 6)          │
│                                     │
│ [💬 "Make easier"]                  │
│ [💬 "Add hint"]                     │
│ [🎨 "Better image"]                 │
│ [✏️ Edit Manually]                  │
└─────────────────────────────────────┘
```

**4. Media Tab**:
```
Media Library (8 assets, $0.32 total)

[Grid view of all media]
Each card has: [💬 Chat about this]
```

**5. JSON Tab**:
```
{
  "id": "liver-anatomy-g6",
  "title": "Liver Anatomy - Grade 6",
  "studyTexts": [...],
  "items": [...]
}

[💬 "Explain this structure"]
[⬇️ Export] [✏️ Edit JSON]
```

---

## **Chat Interaction Patterns**

### **Pattern 1: Contextual Quick Actions**

When user clicks an item in preview:
```
🤖: You clicked Item 5. What would you like to do?

[Make it easier] [Make it harder] [Add image] [Add hint] 
[Regenerate options] [Delete this item] [Duplicate it]

Or type your request...
```

### **Pattern 2: Natural Language Understanding**

```
👤: "Add more questions about liver diseases"

🤖: I'll add 4 new items about liver diseases to Group 3:
- Cirrhosis identification
- Hepatitis types
- Fatty liver causes
- Liver failure symptoms

With:
- 2 Visual MCQ (comparison images)
- 2 standard MCQ
- Cost: $0.08 (2 images)

[Add These Items] [Customize] [Cancel]
```

### **Pattern 3: Comparison & Alternatives**

```
👤: "Which provider should I use for diagrams?"

🤖: For medical diagrams, here's my analysis:

┌────────────┬─────────┬──────┬─────────┐
│ Provider   │ Quality │ Cost │ Time    │
├────────────┼─────────┼──────┼─────────┤
│ DALL-E 3   │ ⭐⭐⭐⭐⭐ │ $0.04│ 45s    │
│ SDXL       │ ⭐⭐⭐⭐   │ $0.01│ 15s    │
└────────────┴─────────┴──────┴─────────┘

Recommendation: DALL-E 3
Reason: Medical accuracy matters more than speed

Use DALL-E 3 for all diagrams? [Yes] [Mix Both] [SDXL Only]
```

---

## **Technical Implementation**

### **New Components**:

**1. ConversationalStudio.tsx** (Main Page)
```typescript
<ConversationalStudio>
  <ChatPanel>
    <MessageList messages={chatHistory} />
    <QuickActions actions={contextActions} />
    <ChatInput onSend={handleUserMessage} />
  </ChatPanel>
  
  <PreviewPanel>
    <PreviewTabs course={previewCourse} />
    <ContextualActions onAction={handleContextAction} />
  </PreviewPanel>
</ConversationalStudio>
```

**2. ChatPanel.tsx**
- Message list with AI/user/system messages
- Streaming responses
- Action buttons
- Cost badges
- Progress indicators

**3. PreviewPanel.tsx**
- Read-only course preview
- Contextual "Chat about this" buttons
- Inline annotations
- Diff highlighting (when content changes)

**4. ChatEngine.tsx** (Brain)
- OpenAI function calling
- Conversation state management
- Preview state management
- Cost tracking
- Publish orchestration

---

## **Edge Function: chat-course-assistant**

```typescript
// New edge function for chat-based authoring

interface ChatRequest {
  previewId: string;
  message: string;
  currentPreview?: PreviewCourse;
  conversationHistory: Message[];
}

interface ChatResponse {
  message: string;
  actions?: Action[];
  previewUpdates?: Partial<PreviewCourse>;
  cost?: number;
  requiresConfirmation?: boolean;
}

serve(async (req) => {
  const { message, currentPreview, conversationHistory } = await req.json();
  
  // Call OpenAI with function calling
  const completion = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    messages: [
      { role: "system", content: courseAssistantPrompt },
      ...conversationHistory,
      { role: "user", content: message },
    ],
    functions: chatFunctions,
    function_call: "auto",
  });
  
  // Handle function calls
  if (completion.choices[0].function_call) {
    const result = await executeChatFunction(completion.choices[0].function_call);
    return jsonOk(result);
  }
  
  return jsonOk({
    message: completion.choices[0].message.content,
  });
});
```

---

## **System Prompt for AI Assistant**

```
You are an expert educational content designer helping teachers create courses.

Your role:
- Understand course creation requests in natural language
- Generate complete course previews with exercises, study texts, and multimedia
- Suggest improvements and alternatives
- Explain your decisions and trade-offs (cost, quality, time)
- NEVER commit to database without explicit user approval
- Always show cost estimates before generating multimedia
- Recommend best providers based on use case
- Detect and prevent duplicate content

Guidelines:
- Be conversational and friendly
- Ask clarifying questions when needed
- Offer alternatives (cheaper/faster/better)
- Explain educational rationale
- Keep responses concise but informative
- Use emojis sparingly for clarity

When user says:
- "Create a course about X" → Ask grade, items, multimedia preferences
- "Make this easier" → Simplify language, add hints, reduce complexity
- "Add more images" → Identify good candidates, estimate cost, get approval
- "Publish" → Confirm, execute, report success

Cost awareness:
- Always estimate before generating
- Warn if costs exceed $1.00
- Suggest cheaper alternatives when appropriate
- Track total spend per session
```

---

## **Migration from Current System**

### **Phase 1: Build Chat UI (Week 1)**
- Create ConversationalStudio page
- Implement ChatPanel component
- Build PreviewPanel component
- Wire up basic message sending

### **Phase 2: Integrate AI (Week 2)**
- Create chat-course-assistant edge function
- Implement function calling
- Connect to generate-course-proposal
- Test conversation flows

### **Phase 3: Preview State (Week 2-3)**
- In-memory preview management
- Preview updates on chat actions
- Diff highlighting
- Cost tracking

### **Phase 4: Publish Flow (Week 3)**
- Batch media upload
- Database commit
- Catalog update
- Success confirmation

### **Phase 5: Advanced Features (Week 4+)**
- Voice input
- Image upload via chat
- Reference existing courses
- Curriculum alignment suggestions

---

## **Updated Implementation Plan**

### **Option A: Full Conversational Rebuild** 🚀
**Time**: 3-4 weeks  
**Effort**: High  
**Impact**: Revolutionary UX  

**Pros**:
- Future-proof design
- Industry-leading UX
- Natural interaction
- Better user adoption

**Cons**:
- Significant rebuild
- Need to migrate existing workflows
- More complex testing

---

### **Option B: Hybrid Approach** ⚡ **(RECOMMENDED)**
**Time**: 1-2 weeks  
**Effort**: Medium  
**Impact**: High  

**Keep**: Current AIAuthor structure (tabs)  
**Add**: Chat panel as **overlay/sidebar**  
**Integrate**: Chat controls the preview state  

```
┌───────────────────────────────────────────────┐
│  Course Studio              [💬 Chat] [Tabs]  │
├───────────────────────────────────────────────┤
│                                               │
│  [When Chat toggled ON]                       │
│  ┌─────────┐  ┌──────────────────────────┐  │
│  │ Chat    │  │ Preview (reactive)       │  │
│  │ Panel   │  │                          │  │
│  │         │  │ Current tab content      │  │
│  └─────────┘  └──────────────────────────┘  │
│                                               │
│  [When Chat toggled OFF]                      │
│  Traditional tabbed interface                 │
│                                               │
└───────────────────────────────────────────────┘
```

**Benefits**:
- Faster implementation
- Backward compatible
- Users can choose chat or traditional
- Gradual migration

---

### **Option C: Chat-First with Tab Fallback** 🎯
**Time**: 2-3 weeks  
**Effort**: Medium-High  
**Impact**: Very High  

**Default**: Chat interface  
**Advanced**: Toggle to show tabs for power users  

```
┌────────────────────────────────────────────┐
│  Course Studio        [⚙️ Advanced Mode]   │
├────────────────────────────────────────────┤
│  💬 Chat-First Interface (Default)         │
│  ┌──────────┐  ┌──────────────────────┐   │
│  │ Chat     │  │ Live Preview         │   │
│  └──────────┘  └──────────────────────┘   │
│                                            │
│  [When Advanced Mode ON]                   │
│  ┌──────────────────────────────────────┐ │
│  │ Full tabs + direct editing           │ │
│  └──────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

---

## **Recommended: Hybrid Approach (Option B)**

### **Why:**
- ✅ Best of both worlds
- ✅ Reasonable timeline (1-2 weeks)
- ✅ Low risk (existing UI remains functional)
- ✅ Progressive enhancement
- ✅ User choice (chat or traditional)

### **Implementation**:

**Week 1: Chat Integration**
1. Add ChatPanel component
2. Create chat-course-assistant edge function
3. Wire up to preview state
4. Test basic conversations

**Week 2: Refine & Polish**
1. Add contextual quick actions
2. Improve AI responses
3. Add cost warnings
4. Full E2E testing

---

## **Todo List for Hybrid Approach**

### **High Priority** (Week 1)
- [ ] Create ChatPanel component with message list
- [ ] Create ChatInput with quick actions
- [ ] Add chat toggle to AIAuthor header
- [ ] Create chat-course-assistant edge function
- [ ] Implement function calling for course operations
- [ ] Wire chat to preview state
- [ ] Add streaming response support
- [ ] Test basic chat workflow

### **Medium Priority** (Week 2)
- [ ] Add contextual "Chat about this" buttons to preview
- [ ] Implement cost estimation in chat
- [ ] Add conversation history persistence
- [ ] Improve AI system prompt
- [ ] Add chat-based media regeneration
- [ ] Test complex multi-turn conversations

### **Lower Priority** (Week 2+)
- [ ] Add voice input
- [ ] Add image upload via chat
- [ ] Add keyboard shortcuts
- [ ] Add chat export/share
- [ ] E2E tests for chat workflows

---

**APPROVE THIS PLAN (Hybrid Approach)?**

Or would you prefer:
- **Full conversational** (Option A) - Complete rebuild
- **Chat-first** (Option C) - Chat as primary, tabs as fallback
- **Modify** - Adjust the hybrid approach

