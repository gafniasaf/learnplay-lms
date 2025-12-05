# Interactive Course Proposal System - Extensible Architecture

## **Design Philosophy**

**Plugin-Based Architecture:** Each capability (images, videos, linking, deduplication) is a separate "proposal enhancer" that can be enabled/disabled independently.

**AI Agent Framework:** The LLM acts as an orchestrator with access to tools/functions for querying existing content, validating constraints, and generating media.

---

## **Core Architecture**

### **1. Proposal Pipeline (Extensible)**

```typescript
interface ProposalPipeline {
  phases: ProposalPhase[];
  enhancers: ProposalEnhancer[];
  validators: ProposalValidator[];
}

interface ProposalPhase {
  id: string;
  name: string;
  execute: (proposal: Proposal, context: Context) => Promise<Proposal>;
}

interface ProposalEnhancer {
  id: string;
  name: string;
  enabled: boolean;
  enhance: (proposal: Proposal, userInput?: string) => Promise<Enhancement>;
}
```

**Built-in Phases:**
1. `initial-draft` - AI creates base proposal
2. `content-scan` - Check for existing similar content
3. `media-planning` - Plan images/audio/video
4. `exercise-design` - Design adaptive exercises
5. `user-refinement` - Interactive chat loop
6. `final-validation` - Check all constraints
7. `generation` - Create actual course

**Pluggable Enhancers:**
- ✅ `image-generator` (DALL-E 3)
- 🔜 `video-generator` (Replicate, future)
- 🔜 `content-linker` (Link to existing subjects/protocols)
- 🔜 `deduplication-checker` (Scan for similar courses)
- 🔜 `multimedia-suggester` (Recommend audio/video opportunities)
- 🔜 `curriculum-aligner` (Map to standards like DepEd MATATAG)

---

## **Database Schema (Extensible)**

```sql
-- Proposals table with metadata for extensibility
create table public.course_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  
  -- Input parameters
  initial_params jsonb not null,  -- { subject, grade, items, mode, ... }
  
  -- Proposal state (JSON for flexibility)
  proposal_data jsonb not null,  -- Current proposal structure
  
  -- Chat history (array of messages)
  conversation jsonb[] default array[]::jsonb[],
  
  -- Enhancer states (which plugins ran, their outputs)
  enhancer_states jsonb default '{}'::jsonb,  -- { "image-generator": {...}, "content-linker": {...} }
  
  -- Metadata
  approved boolean default false,
  status text default 'drafting',
  
  -- Generated course reference
  course_id text,
  final_course_json jsonb,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Plugin registry (configure available enhancers)
create table public.proposal_enhancers (
  id text primary key,  -- e.g., "image-generator", "video-suggester"
  name text not null,
  description text,
  enabled boolean default true,
  config jsonb default '{}'::jsonb,  -- Plugin-specific settings
  constraints jsonb default '{}'::jsonb,  -- Limits: max_images, max_videos, etc.
  created_at timestamptz default now()
);

-- Insert default enhancers
insert into public.proposal_enhancers (id, name, description, enabled, constraints) values
('image-generator', 'DALL-E 3 Image Generation', 'Generate educational diagrams and illustrations', true, 
 '{"max_images_per_course": 10, "max_images_per_study_text": 3, "cost_per_image": 0.04}'::jsonb),
('video-generator', 'Video Generation', 'Generate educational videos (Replicate)', false, 
 '{"max_videos_per_course": 3, "max_duration_seconds": 30, "cost_per_video": 0.25}'::jsonb),
('content-linker', 'Content Linking', 'Link to existing subjects and protocols', true, 
 '{"max_links_per_item": 3}'::jsonb),
('deduplication-checker', 'Duplicate Detection', 'Scan for similar existing courses', true, 
 '{"similarity_threshold": 0.8}'::jsonb);
```

---

## **AI Agent with Tools (Function Calling)**

The AI has access to tools for querying the system:

### **Tool 1: `scan_existing_content`**
```typescript
{
  name: "scan_existing_content",
  description: "Search for existing courses, study texts, or protocols similar to the proposal",
  parameters: {
    query: "string - search query",
    content_type: "'course' | 'study_text' | 'protocol'",
    similarity_threshold: "number (0-1)"
  },
  returns: {
    matches: Array<{
      id: string,
      title: string,
      similarity_score: number,
      can_reuse: boolean
    }>
  }
}
```

**Example:**
```
AI: Let me check for existing content about liver anatomy...
[Calls scan_existing_content("liver anatomy", "study_text", 0.7)]
AI: Found 1 existing study text "Liver Structure Basics" (85% similar). 
    Would you like to reuse this instead of generating new content?
```

### **Tool 2: `check_system_constraints`**
```typescript
{
  name: "check_system_constraints",
  description: "Validate if a proposed feature fits within system capabilities",
  parameters: {
    feature_type: "'image' | 'video' | 'audio' | 'interactive'",
    quantity: "number",
    metadata: "object"
  },
  returns: {
    allowed: boolean,
    reason: string,
    alternative: string (if not allowed)
  }
}
```

**Example:**
```
User: Add 15 videos
AI: [Calls check_system_constraints("video", 15, {})]
AI: The system currently supports max 3 videos per course (cost/performance limits).
    Alternative: I can add 3 key videos + 12 still images for other concepts.
    Approve this approach?
```

### **Tool 3: `link_to_existing_content`**
```typescript
{
  name: "link_to_existing_content",
  description: "Link proposal items to existing subjects, protocols, or reference materials",
  parameters: {
    item_description: "string",
    link_type: "'subject' | 'protocol' | 'course'"
  },
  returns: {
    matches: Array<{ id: string, title: string, relevance: number }>,
    recommended_link: string
  }
}
```

**Example:**
```
AI: [Scans for existing protocols about liver diseases]
AI: Found existing protocol "Liver Disease Diagnosis Flowchart" in the system.
    I'll link items 12-15 to this protocol for deeper learning.
    Students can access it after answering questions.
```

### **Tool 4: `estimate_generation_cost`**
```typescript
{
  name: "estimate_generation_cost",
  description: "Calculate cost and time for proposed media generation",
  parameters: {
    images: number,
    videos: number,
    audio_minutes: number
  },
  returns: {
    cost_usd: number,
    estimated_time_seconds: number,
    breakdown: object
  }
}
```

---

## **Proposal JSON Schema (Extensible)**

```typescript
interface CourseProposal {
  version: "1.0";  // Schema version for future compatibility
  
  metadata: {
    subject: string;
    grade: string;
    learningObjectives: string[];
    difficulty: string;
  };
  
  studyTexts: Array<{
    id: string;
    title: string;
    sections: Array<{
      title: string;
      contentSummary: string;
      estimatedParagraphs: number;
    }>;
    estimatedReadingTime: number;
  }>;
  
  media: {
    images: Array<{
      id: string;
      description: string;
      location: string;  // "study-text-1/section-2" or "item-5"
      type: "diagram" | "photo" | "illustration";
      priority: "required" | "nice-to-have";
    }>;
    videos: Array<{  // Future
      id: string;
      description: string;
      location: string;
      duration_seconds: number;
    }>;
    audio: Array<{  // Future
      id: string;
      text: string;
      voice: string;
      location: string;
    }>;
  };
  
  exercises: {
    groups: Array<{
      id: number;
      name: string;
      topic: string;
      itemCount: number;
      linkedStudyTextIds: string[];
    }>;
    totalItems: number;
    adaptiveSettings: {
      clustersPerGroup: number;
      variantsPerCluster: number;
    };
  };
  
  contentLinks: {  // Future: Link to existing content
    existingSubjects: Array<{
      subjectId: string;
      title: string;
      relevance: number;
      linkToItems: number[];
    }>;
    existingProtocols: Array<{  // Future
      protocolId: string;
      title: string;
      linkToItems: number[];
    }>;
  };
  
  costEstimate: {
    images: { count: number; cost_usd: number };
    videos: { count: number; cost_usd: number };
    audio: { minutes: number; cost_usd: number };
    total_usd: number;
    estimated_time_seconds: number;
  };
  
  aiReasoning: string;  // AI explains its choices
}
```

---

## **Chat Message Schema**

```typescript
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  
  // Function calls (AI using tools)
  tool_calls?: Array<{
    tool: string;
    parameters: object;
    result: object;
  }>;
  
  // Proposal changes (track what changed)
  proposal_changes?: {
    added: string[];
    removed: string[];
    modified: string[];
  };
}
```

---

## **Future Extensibility Examples**

### **Adding Video Support (Future)**

1. **Enable in database:**
```sql
update public.proposal_enhancers 
set enabled = true 
where id = 'video-generator';
```

2. **AI automatically offers videos:**
```
AI: I notice this topic (mitosis) would benefit from animation.
    Would you like me to add a 15-second video showing cell division?
    Cost: $0.25, Time: +3 minutes
```

3. **No code changes needed** - just enable the plugin!

### **Adding Protocol Linking (Future)**

1. **Create protocols table** (separate feature)
2. **Add tool: `link_to_protocol`**
3. **Enable enhancer:**
```sql
update public.proposal_enhancers 
set enabled = true 
where id = 'protocol-linker';
```

4. **AI automatically suggests:**
```
AI: Found existing clinical protocol "Liver Biopsy Procedure"
    I'll link items 8-10 to this protocol for advanced students.
```

### **Adding Curriculum Alignment (Future)**

```typescript
// New tool
{
  name: "align_to_curriculum",
  description: "Map course to official curriculum standards (e.g., DepEd MATATAG)",
  parameters: {
    grade: string,
    subject: string
  },
  returns: {
    standards: Array<{
      code: string,
      description: string,
      covered_by_items: number[]
    }>
  }
}
```

**AI:** "This course covers DepEd MATATAG standards: MATH-GR3-01, MATH-GR3-03, MATH-GR3-05"

---

## **Implementation Strategy**

### **Phase 1: Core Framework (Week 1)**
- Proposal table + basic chat
- AI with function calling
- 2 tools: `scan_existing_content`, `check_system_constraints`
- 1 enhancer: `image-generator`
- UI: Proposal chat interface

### **Phase 2: Image Generation (Week 1)**
- Inline DALL-E 3 generation
- Cost estimation
- Preview in proposal

### **Phase 3: Content Linking (Week 2)**
- Scan existing study texts
- Suggest reuse vs generate new
- Link exercises to existing subjects

### **Phase 4: Advanced Features (Week 3+)**
- Video generation (when enabled)
- Protocol linking
- Curriculum alignment
- Duplicate detection with merge suggestions

---

## **Extensibility Checklist**

✅ **Plugin Registry:** `proposal_enhancers` table  
✅ **Tool-Based AI:** Function calling for system queries  
✅ **JSON Schema:** Versioned, additive-only changes  
✅ **Feature Flags:** Enable/disable enhancers per environment  
✅ **Cost Tracking:** Per-enhancer cost estimates  
✅ **Audit Trail:** Chat history preserves all decisions  

---

## **Example: Adding New Capability**

**Scenario:** Add support for interactive simulations

**Steps:**
1. **Add enhancer config:**
```sql
insert into public.proposal_enhancers values
('simulation-generator', 'Interactive Simulations', 'Generate PhET-style simulations', false, 
 '{"max_sims_per_course": 2, "providers": ["PhET", "custom"]}'::jsonb);
```

2. **Add tool for AI:**
```typescript
{
  name: "add_simulation",
  description: "Add interactive simulation to course",
  parameters: { topic: string, type: "lab" | "demo" | "game" },
  implementation: async (params) => {
    // Check if PhET has existing sim
    // OR queue custom simulation generation
    return { simulation_url, embed_code }
  }
}
```

3. **Update proposal schema:**
```typescript
interface CourseProposal {
  // Existing fields...
  
  simulations?: Array<{  // Optional, backwards compatible
    id: string;
    description: string;
    provider: string;
    embedUrl: string;
  }>;
}
```

4. **Enable:**
```sql
update public.proposal_enhancers 
set enabled = true 
where id = 'simulation-generator';
```

5. **AI automatically offers:**
```
AI: For "Chemical Reactions", I can add an interactive simulation 
    where students mix virtual chemicals. Would you like this?
```

**Zero changes to core proposal engine!**

---

## **Proposal Chat Commands (Power User Features)**

Users can use special commands:

```
/scan liver       → Scan for existing liver-related content
/cost            → Show detailed cost breakdown
/constraints     → Show all system limits
/similar         → Find similar courses
/protocols liver → Search for liver protocols
/preview images  → Show planned images
/enable videos   → Request video generation (if available)
/link protocol-123 to items 5-8  → Link existing protocol
```

AI recognizes these and calls appropriate tools.

---

## **System Constraint Registry**

```sql
create table public.system_constraints (
  id text primary key,
  category text not null,  -- 'media', 'content', 'exercises'
  constraint_type text not null,  -- 'max_count', 'max_size', 'max_cost'
  value jsonb not null,
  description text,
  updated_at timestamptz default now()
);

insert into public.system_constraints values
('max_images_per_course', 'media', 'max_count', '10'::jsonb, 'Maximum images per course'),
('max_videos_per_course', 'media', 'max_count', '3'::jsonb, 'Maximum videos per course'),
('max_study_texts', 'content', 'max_count', '6'::jsonb, 'Maximum study texts per course'),
('max_items_per_group', 'exercises', 'max_count', '20'::jsonb, 'Maximum items in one group'),
('image_generation_cost', 'media', 'cost_per_unit', '0.04'::jsonb, 'USD per DALL-E 3 image'),
('video_generation_cost', 'media', 'cost_per_unit', '0.25'::jsonb, 'USD per Replicate video');
```

AI queries this table to validate user requests:
```
User: Add 20 images
AI: [Queries system_constraints]
AI: Maximum is 10 images per course (performance/cost limits).
    I can prioritize the 10 most important concepts. Which topics 
    are highest priority for visual aids?
```

---

## **Content Deduplication Flow**

### **1. Initial Scan (Automatic)**

When proposal is created:
```typescript
// Scan for similar courses
const similar = await tools.scan_existing_content({
  query: proposal.metadata.subject,
  content_type: 'course',
  similarity_threshold: 0.7
});

if (similar.length > 0) {
  // Add to proposal
  proposal.contentLinks.similarCourses = similar;
  
  // AI mentions in initial proposal
  aiMessage = `I found ${similar.length} existing courses about ${subject}.
               Would you like to review them before I generate a new one?
               We could merge concepts or extend an existing course.`;
}
```

### **2. User-Triggered Scan**

```
User: Are there any existing courses about the liver?

AI: [Calls scan_existing_content]
AI: Found 2 existing courses:
    1. "Liver Anatomy Basics" (73% similar) - 12 items
    2. "Digestive System" (45% similar) - includes liver section
    
    Options:
    A) Extend "Liver Anatomy Basics" with advanced topics
    B) Merge content from both into comprehensive course
    C) Generate completely new course (current plan)
    
    Which would you prefer?
```

### **3. Smart Reuse**

```
User: Option A - extend existing

AI: Great! I'll:
    ✓ Load "Liver Anatomy Basics" (12 items)
    ✓ Add 8 new items on liver diseases
    ✓ Keep existing study texts
    ✓ Add 1 new study text "Liver Pathology"
    ✓ Generate 2 new images for new content
    
    This saves $0.08 in image costs and builds on proven content.
```

---

## **Protocol Linking Architecture**

### **Protocols Table (Future)**

```sql
create table public.protocols (
  id uuid primary key,
  protocol_id text unique not null,  -- "LIVER-BIOPSY-2024"
  title text not null,
  category text,  -- "clinical", "diagnostic", "therapeutic"
  content text not null,  -- Rich text protocol steps
  metadata jsonb,
  created_at timestamptz default now()
);

-- Link protocols to course items
create table public.item_protocol_links (
  id uuid primary key,
  course_id text not null,
  item_id integer not null,
  protocol_id text references public.protocols(protocol_id),
  display_trigger text default 'on_request',  -- "on_request", "after_answer", "before_answer"
  created_at timestamptz default now()
);
```

### **AI Linking Logic**

```typescript
// AI scans for relevant protocols
const protocols = await tools.scan_existing_content({
  query: `${subject} protocols procedures`,
  content_type: 'protocol'
});

if (protocols.length > 0) {
  proposal.contentLinks.protocols = protocols.map(p => ({
    id: p.id,
    title: p.title,
    relevance: p.similarity_score,
    suggestedItems: []  // AI suggests which items should link
  }));
  
  aiMessage = `Found ${protocols.length} existing protocols:
               ${protocols.map(p => `- ${p.title}`).join('\n')}
               
               I'll link relevant exercises to these protocols.
               Students can access protocols for deeper learning.`;
}
```

---

## **Approval Flow with Branches**

User can branch the proposal:

```
Initial Proposal (Branch A)
    ↓
User: "Try version with videos"
    ↓
Branch B: Proposal + Videos
    ↙        ↘
Branch A    Branch B
(original)  (with videos)

User compares and picks Branch B → Generate
```

---

## **Cost-Benefit Analysis Tool**

```
AI: Here's the cost breakdown:

Option A: Text-Heavy (Current)
- 4 study texts
- 3 images ($0.12)
- 16 items
Total cost: $0.12 | Time: 45s

Option B: Visual-Rich
- 4 study texts
- 8 images ($0.32)
- 16 items
Total cost: $0.32 | Time: 90s
+167% cost, +100% engagement

Option C: Multimedia
- 4 study texts
- 6 images ($0.24)
- 2 videos ($0.50)
- 16 items
Total cost: $0.74 | Time: 240s
+517% cost, +200% engagement, ⚠️ slow generation

Recommendation: Option B (best balance)
```

---

## **Implementation Roadmap**

### **MVP (Week 1-2): Core + Images**
- ✅ Proposal generation with chat
- ✅ Image planning and generation
- ✅ Basic validation
- ✅ Approve/Cancel

### **V2 (Week 3-4): Content Scanning**
- ✅ scan_existing_content tool
- ✅ Deduplication checker
- ✅ Reuse suggestions

### **V3 (Week 5-6): Linking**
- ✅ Link to existing subjects
- ✅ Protocol linking (if protocols exist)
- ✅ Cross-course references

### **V4 (Week 7+): Advanced Media**
- ✅ Video generation (when enabled)
- ✅ Audio/TTS in study texts
- ✅ Interactive elements

---

## **Benefits of This Architecture**

✅ **Future-Proof:** Add videos/protocols/simulations without rewriting core  
✅ **Flexible:** Enable/disable features per environment  
✅ **Cost-Aware:** AI considers budget constraints  
✅ **Smart Reuse:** Prevents content duplication  
✅ **Transparent:** User sees all decisions and costs upfront  
✅ **Extensible:** New tools/enhancers plug in easily  
✅ **Versioned:** Schema evolution via version field  

---

**This architecture supports your vision of:**
- ✅ Interactive proposal with AI chat
- ✅ Easily adding videos (just flip enabled = true)
- ✅ Linking to protocols (when protocol system exists)
- ✅ Scanning existing content to prevent redundancy
- ✅ All future ideas can be added as plugins

**Approve this architecture?** If yes, I'll implement the MVP (Core + Images) with the extensible foundation! 🏗️
