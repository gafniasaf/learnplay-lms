# Reference Texts Integration

## Overview

This document outlines the integration of reference texts (study materials) with the existing LearnPlay exercise system, creating a relationship model similar to the Azure TeacherGPT system while maintaining our current adaptive algorithm.

## Conceptual Model

### Entities and Relationships

```
Subject (Reference Text)
    ↓ 1:many
Learning Objective
    ↓ 1:1
Topic (Exercise Cluster)
    ↓ 1:many
Exercise Items (our current CourseItem)
```

## Database Schema

### 1. Subjects Table (Reference Texts)

```sql
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  subject_id text unique not null,  -- e.g., "MATH-GR3-FRACTIONS"
  title text not null,
  content text not null,  -- Rich text with [SECTION:] and [IMAGE:] markers
  content_html text,  -- Rendered HTML version
  education_level text,  -- Grade band: "K-2", "3-6", "6-8", etc.
  category text,  -- Subject area: "Mathematics", "Science", etc.
  metadata jsonb default '{}'::jsonb,  -- Tags, difficulty, source info
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subjects_subject_id_idx on public.subjects(subject_id);
create index subjects_category_idx on public.subjects(category);
create index subjects_education_level_idx on public.subjects(education_level);
create index subjects_content_search_idx on public.subjects using gin(to_tsvector('english', content));

alter table public.subjects enable row level security;

-- RLS: Public read, authenticated write (admin only)
create policy subjects_select_all on public.subjects for select using (true);
create policy subjects_insert_admin on public.subjects for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
```

### 2. Learning Objectives Table

```sql
create table public.learning_objectives (
  id uuid primary key default gen_random_uuid(),
  objective_id text unique not null,  -- e.g., "LO-MATH-FRAC-01"
  description text not null,  -- "Student can add fractions with like denominators"
  subject_ids text[] not null,  -- Array of linked subject_id references
  topic_id text,  -- Links to exercise cluster (our course groups)
  education_level text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index learning_objectives_topic_id_idx on public.learning_objectives(topic_id);
create index learning_objectives_subject_ids_idx on public.learning_objectives using gin(subject_ids);

alter table public.learning_objectives enable row level security;

create policy learning_objectives_select_all on public.learning_objectives for select using (true);
create policy learning_objectives_insert_admin on public.learning_objectives for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
```

### 3. Topic-Exercise Mapping Table

```sql
create table public.topic_exercise_mapping (
  id uuid primary key default gen_random_uuid(),
  topic_id text not null,  -- Links to learning_objective.topic_id
  course_id text not null,  -- Our current course ID
  group_id integer not null,  -- Group within course
  cluster_id text not null,  -- Our current clusterId
  variant text,  -- Optional: specific variant
  created_at timestamptz not null default now()
);

create unique index topic_exercise_unique_idx on public.topic_exercise_mapping(topic_id, course_id, group_id, cluster_id);
create index topic_exercise_course_idx on public.topic_exercise_mapping(course_id);
create index topic_exercise_topic_idx on public.topic_exercise_mapping(topic_id);

alter table public.topic_exercise_mapping enable row level security;

create policy topic_exercise_select_all on public.topic_exercise_mapping for select using (true);
```

### 4. Item-Subject Display Rules Table

```sql
create table public.item_subject_display_rules (
  id uuid primary key default gen_random_uuid(),
  course_id text not null,
  item_id integer not null,
  subject_id text not null references public.subjects(subject_id),
  display_trigger text not null check (display_trigger in ('after_answer', 'before_answer', 'on_incorrect', 'on_request')),
  display_format text default 'modal' check (display_format in ('modal', 'inline', 'sidebar')),
  section_filter text[],  -- Show only specific [SECTION:] tags
  priority integer default 1,  -- If multiple subjects, show in priority order
  created_at timestamptz not null default now()
);

create index item_subject_course_item_idx on public.item_subject_display_rules(course_id, item_id);
create index item_subject_subject_idx on public.item_subject_display_rules(subject_id);

alter table public.item_subject_display_rules enable row level security;

create policy item_subject_select_all on public.item_subject_display_rules for select using (true);
```

## Integration with Current System

### Course JSON Enhancement (Backwards Compatible)

```json
{
  "id": "fractions-gr3",
  "title": "Fractions Grade 3",
  "studyTexts": [
    {
      "id": "intro-fractions",
      "title": "Introduction to Fractions",
      "content": "[SECTION:What are Fractions?]\nA fraction represents...\n[IMAGE:fractions/intro.png]",
      "order": 1,
      "learningObjectives": ["LO-MATH-FRAC-01"]
    },
    {
      "id": "adding-fractions",
      "title": "Adding Fractions",
      "content": "[SECTION:Like Denominators]\nWhen adding fractions...\n[IMAGE:fractions/addition.png]",
      "order": 2,
      "learningObjectives": ["LO-MATH-FRAC-01", "LO-MATH-FRAC-02"]
    }
  ],
  "items": [
    {
      "id": 0,
      "text": "1/4 + 1/4 = [blank]",
      "mode": "numeric",
      "answer": 0.5,
      "clusterId": "100",
      "variant": "1",
      "groupId": 0,
      "relatedStudyTextIds": ["adding-fractions"],  // NEW: Which study texts are relevant
      "learningObjectiveId": "LO-MATH-FRAC-01"      // NEW: Which learning objective
    }
  ]
}
```

### Simplified Schema (Course-Embedded Study Texts)

Since study texts should be freely accessible as part of the course, we'll embed them directly in the course JSON rather than separate tables. This keeps everything together and works with our existing Storage architecture.

## AI-Powered Subject Generation

### Approach 1: Upload Source Materials

**User Workflow:**
1. Navigate to `/admin/subjects/generate`
2. Upload PDF, DOCX, or HTML files
3. AI extracts content and generates structured subjects
4. System creates [SECTION:] markers automatically
5. Extracts/uploads images to Storage
6. Saves to `subjects` table

**Edge Function:** `generate-subjects-from-upload`

```typescript
// Input: File upload (PDF/DOCX/HTML)
// Process:
// 1. Extract text and images using PDF.js or Mammoth.js
// 2. Send to OpenAI with prompt:
//    "Extract educational content into sections. For each section, provide:
//     - Section title
//     - Content text
//     - Learning objectives covered
//     Format output with [SECTION:Title] markers."
// 3. Upload images to Storage
// 4. Replace image references with [IMAGE:path] markers
// 5. Save to subjects table
```

### Approach 2: AI Research & Generation

**User Workflow:**
1. Navigate to `/admin/subjects/generate`
2. Enter topic prompt: "Create study text about photosynthesis for Grade 6"
3. AI uses:
   - Built-in knowledge
   - Web browsing (via OpenAI's web search or Perplexity API)
   - Deep research mode (multiple queries + synthesis)
4. Generates structured content with sections and images
5. Saves to `subjects` table

**Edge Function:** `generate-subjects-ai-research`

```typescript
// Input: { topic, gradeLevel, depth: 'basic' | 'deep' }
// Process:
// 1. If depth === 'deep':
//    - Use Perplexity API or OpenAI with web browsing enabled
//    - Multiple research queries
//    - Synthesize findings
// 2. Generate structured content:
//    - [SECTION:] markers for hierarchy
//    - Learning objectives identified
//    - Related topics/exercises suggested
// 3. Optionally generate images with DALL-E for key concepts
// 4. Save to subjects table with metadata
```

### Approach 3: LLM Suggestions

**User Workflow:**
1. When creating a course in AI Author
2. System suggests: "Would you like to create reference texts for this course?"
3. AI generates subject content based on course items
4. Links subjects to exercise clusters automatically

## UI Components

### 1. Subject Browser (`/admin/subjects`)

**Features:**
- Table view: Subject ID, Title, Category, Education Level, Last Updated
- Search by title, content (full-text search)
- Filter by category, education level
- Actions: View, Edit, Delete, Link to Exercises

**Component:** `src/pages/admin/SubjectBrowser.tsx`

### 2. Subject Editor (`/admin/subjects/:id/edit`)

**Features:**
- Rich text editor for content
- [SECTION:] marker insertion
- Image upload with [IMAGE:] marker insertion
- Learning objectives linkage
- Preview pane showing rendered content
- Metadata editor (tags, difficulty, source)

**Component:** `src/pages/admin/SubjectEditor.tsx`

### 3. Subject Generator (`/admin/subjects/generate`)

**Features:**
- Three tabs: "Upload Files", "AI Research", "From Course"
- **Upload Tab:**
  - File drop zone (PDF, DOCX, HTML)
  - Processing progress
  - Preview extracted content
  - Edit before saving
- **AI Research Tab:**
  - Topic prompt field
  - Grade level selector
  - Depth selector (Basic / Deep Research)
  - Source preferences (Web / Built-in knowledge)
  - Generate button
  - Edit generated content
- **From Course Tab:**
  - Select existing course
  - AI analyzes items and generates reference texts
  - Automatic linking

**Component:** `src/pages/admin/SubjectGenerator.tsx`

### 4. Exercise-Subject Linker (`/admin/subjects/link`)

**Features:**
- Left panel: Exercise browser (by course, group, cluster)
- Right panel: Subject browser
- Drag-and-drop to link
- Display rules configurator:
  - When to show: Before answer / After answer / On incorrect / On request
  - How to show: Modal / Inline / Sidebar
  - Which sections to show

**Component:** `src/pages/admin/SubjectLinker.tsx`

### 5. Subject Viewer (Student-Facing)

**Features:**
- Renders [SECTION:] markers as headings
- Renders [IMAGE:] markers as images from Storage
- Collapsible sections
- Print/export functionality
- Accessibility features (text-to-speech, adjustable font size)

**Component:** `src/components/learning/SubjectViewer.tsx`

## Display Logic in Play UI

### Trigger Points

**After Answer Submission:**
```typescript
// In src/pages/Play.tsx after handleSubmit

if (isCorrect) {
  // Check if item has linkedSubjects for reinforcement
  const subjectRules = await fetchSubjectDisplayRules(courseId, currentItem.id, 'after_answer');
  
  if (subjectRules.length > 0) {
    showSubjectModal(subjectRules[0].subject);
  }
} else {
  // On incorrect, show reference text to help learn
  const subjectRules = await fetchSubjectDisplayRules(courseId, currentItem.id, 'on_incorrect');
  
  if (subjectRules.length > 0) {
    showSubjectModal(subjectRules[0].subject, { highlight: relevantSection });
  }
}
```

**On Request (Help Button):**
```typescript
// Add "Show Reference" button in Play UI
<Button
  variant="ghost"
  onClick={() => showSubjectForCurrentItem()}
>
  <BookOpen className="h-4 w-4 mr-2" />
  Show Reference Text
</Button>
```

## Content Format Specification

### Markdown with Special Markers

```markdown
[SECTION:Introduction]
Fractions represent parts of a whole. The numerator indicates how many parts we have, while the denominator shows how many equal parts the whole is divided into.

[IMAGE:fractions/pizza-quarters.png]

[SECTION:Adding Fractions]
When adding fractions with the same denominator (like denominators), we:
1. Keep the denominator the same
2. Add the numerators
3. Simplify if possible

Example: 1/4 + 2/4 = 3/4

[IMAGE:fractions/addition-visual.png]

[SECTION:Common Mistakes]
Students often mistakenly add both numerators AND denominators:
❌ Wrong: 1/4 + 1/4 = 2/8
✅ Correct: 1/4 + 1/4 = 2/4 = 1/2
```

### Rendering Logic

```typescript
function parseSubjectContent(studyText: string): Section[] {
  const sections: Section[] = [];
  const lines = studyText.split('\n');
  
  let currentSection: Section | null = null;
  
  for (const line of lines) {
    if (line.startsWith('[SECTION:')) {
      const title = line.match(/\[SECTION:(.*)\]/)?.[1];
      currentSection = { title, content: [], images: [] };
      sections.push(currentSection);
    } else if (line.startsWith('[IMAGE:')) {
      const imagePath = line.match(/\[IMAGE:(.*)\]/)?.[1];
      const imageUrl = `${STORAGE_URL}/${imagePath}`;
      currentSection?.images.push(imageUrl);
    } else if (currentSection && line.trim()) {
      currentSection.content.push(line);
    }
  }
  
  return sections;
}
```

## AI Generation Strategies

### Strategy 1: Upload-Based Generation

**Input:** PDF, DOCX, HTML files  
**Process:**
1. Extract text using `pdf-lib` (Deno) or OpenAI's file upload API
2. Extract images and upload to Storage
3. Send extracted text to AI:
   ```
   "You are an educational content expert. Convert this text into structured study material.
   
   Requirements:
   - Use [SECTION:Title] to mark major topics
   - Ensure content is appropriate for {gradeLevel}
   - Identify 3-5 key learning objectives
   - Insert [IMAGE:placeholder] where diagrams would help
   
   Original text:
   {extractedText}"
   ```
4. Parse AI response
5. Generate images for [IMAGE:placeholder] using DALL-E
6. Save to `subjects` table

**Edge Function:** `supabase/functions/generate-subject-from-upload/index.ts`

### Strategy 2: AI Deep Research

**Input:** Topic description + grade level  
**Process:**
1. Use Perplexity API or OpenAI with web browsing:
   ```
   "Research the topic '{topic}' for grade level {grade}.
   
   Requirements:
   - Find 5-7 authoritative sources
   - Synthesize into coherent study text
   - Use [SECTION:] markers for organization
   - Include real-world examples
   - Suggest visual aids with [IMAGE:description]
   - Identify learning objectives
   
   Format as structured educational content."
   ```
2. Generate images for [IMAGE:description] markers
3. Create learning objectives automatically
4. Save to `subjects` table

**Edge Function:** `supabase/functions/generate-subject-research/index.ts`

### Strategy 3: From Existing Course

**Input:** Existing course ID  
**Process:**
1. Analyze all items in course
2. Group by `clusterId` and `groupId`
3. For each cluster:
   ```
   "Analyze these practice questions:
   {items in cluster}
   
   Create a study text that teaches the concepts tested.
   Use [SECTION:] markers.
   Suggest [IMAGE:] visualizations.
   Identify the learning objective."
   ```
4. Generate subjects for each major cluster
5. Link subjects to items automatically
6. Save to `subjects` table

**Edge Function:** `supabase/functions/generate-subject-from-course/index.ts`

## Integration Patterns

### Pattern 1: Retroactive Linking

For existing courses without reference texts:

1. **Analyze Course Content:**
   ```sql
   select distinct cluster_id, group_id, string_agg(text, ' | ') as sample_items
   from course_items
   where course_id = 'fractions-gr3'
   group by cluster_id, group_id;
   ```

2. **Generate Subjects:**
   - Submit to `generate-subject-from-course`
   - Creates one subject per major cluster

3. **Create Mappings:**
   - Link learning objectives to topics (clusters)
   - Link items to subjects via display rules

### Pattern 2: Integrated Authoring

When creating new courses in AI Author:

1. **Generate Course Items** (existing flow)
2. **Prompt:** "Would you like reference texts for this course?"
3. **If yes:**
   - Analyze generated items
   - Generate subjects for each group
   - Create learning objectives
   - Link automatically

4. **Result:** Complete course with exercises + reference texts

### Pattern 3: Modular Addition

Add subjects to specific items:

1. In AIAuthor item editor
2. New tab: "Reference Text"
3. Search existing subjects or generate new
4. Configure display rules
5. Save linkage

## Reference Text Viewer UI

### Modal Display (Primary)

```typescript
<Dialog open={showSubject}>
  <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>{subject.title}</DialogTitle>
      <DialogDescription>
        {learningObjective.description}
      </DialogDescription>
    </DialogHeader>
    
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.title}>
          <h3 className="text-lg font-semibold mb-2">{section.title}</h3>
          <div className="prose prose-sm">
            {section.content.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
          {section.images.map((img, i) => (
            <img key={i} src={img} alt={`${section.title} diagram`} className="my-4 rounded-lg" />
          ))}
        </div>
      ))}
    </div>
    
    <DialogFooter>
      <Button onClick={() => setShowSubject(false)}>Got it!</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Sidebar Display (Alternative)

```typescript
<ResizablePanelGroup direction="horizontal">
  <ResizablePanel defaultSize={60}>
    {/* Exercise UI (current Play) */}
    <Stem text={currentItem.text} />
    <OptionGrid options={options} onSelect={handleSelect} />
  </ResizablePanel>
  
  <ResizableHandle />
  
  <ResizablePanel defaultSize={40}>
    {/* Reference Text Sidebar */}
    <ScrollArea className="h-full p-4">
      <SubjectViewer subject={linkedSubject} />
    </ScrollArea>
  </ResizablePanel>
</ResizablePanelGroup>
```

### Inline Display (Compact)

```typescript
<Collapsible>
  <CollapsibleTrigger>
    <Button variant="outline" size="sm">
      <BookOpen className="h-4 w-4 mr-2" />
      Show Reference Text
    </Button>
  </CollapsibleTrigger>
  <CollapsibleContent className="mt-4 p-4 bg-muted rounded-lg">
    <SubjectViewer subject={linkedSubject} compact />
  </CollapsibleContent>
</Collapsible>
```

## Migration Path (Phased Rollout)

### Phase 1: Database Schema (1 day)
- Create migrations for subjects, learning_objectives, mappings, display_rules
- Apply to Supabase
- Verify RLS policies

### Phase 2: Subject Generator UI (2-3 days)
- Build SubjectGenerator page with 3 tabs
- Implement file upload processing
- Integrate AI research mode
- Test with sample content

### Phase 3: Subject Browser & Editor (2 days)
- Build SubjectBrowser page
- Build SubjectEditor with rich text
- Add [SECTION:] and [IMAGE:] marker tools
- Search and filter functionality

### Phase 4: Exercise-Subject Linking (2 days)
- Build SubjectLinker page
- Drag-and-drop interface
- Display rules configurator
- Save mappings to database

### Phase 5: Play UI Integration (1-2 days)
- Add SubjectViewer component
- Implement display triggers (after_answer, on_incorrect, on_request)
- Modal, sidebar, and inline display modes
- "Show Reference" button in Play

### Phase 6: Testing & Documentation (1 day)
- Unit tests for parsing logic
- E2E tests for subject generation and display
- User documentation

**Total Effort:** ~10-12 days for complete integration

## Example: Fraction Addition Course

### Subject

```
ID: MATH-GR3-FRAC-ADD
Title: "Adding Fractions with Like Denominators"
Content:
[SECTION:What are Fractions?]
A fraction represents part of a whole...
[IMAGE:fractions/intro-visual.png]

[SECTION:Like Denominators]
When fractions have the same denominator...
[IMAGE:fractions/like-denominators.png]

[SECTION:Adding Process]
Step 1: Check denominators are the same
Step 2: Add numerators
Step 3: Keep denominator
[IMAGE:fractions/addition-steps.png]
```

### Learning Objective

```
ID: LO-MATH-FRAC-01
Description: "Student can add fractions with like denominators"
Linked Subjects: ["MATH-GR3-FRAC-ADD"]
Topic ID: "TOPIC-FRAC-ADD"
```

### Topic-Exercise Mapping

```
Topic ID: "TOPIC-FRAC-ADD"
Course ID: "fractions-gr3"
Group ID: 0
Cluster ID: "100"
(All items with clusterId="100" test this learning objective)
```

### Display Rule

```
Course ID: "fractions-gr3"
Item IDs: [0, 1, 2, 3]  (all items in cluster 100)
Subject ID: "MATH-GR3-FRAC-ADD"
Display Trigger: "on_incorrect"
Display Format: "modal"
Sections: ["Like Denominators", "Adding Process"]
```

### Result

When student answers incorrectly on any fraction addition question:
1. Modal opens showing the "Adding Process" section
2. Visual diagrams help student understand
3. Student can close and retry with new knowledge

## Benefits of This Approach

1. **Backwards Compatible:** Existing courses work without subjects
2. **Optional Enhancement:** Add subjects only where valuable
3. **Flexible Display:** Configure when/how to show reference texts
4. **AI-Powered:** Generate subjects from multiple sources
5. **Reusable:** One subject can support multiple learning objectives/exercises
6. **Pedagogically Sound:** Matches proven TeacherGPT model
7. **Future-Proof:** Ready for new exercise types from Phase 5

## Next Steps

1. **Review & Approve** this integration plan
2. **Prioritize:** Decide which generation strategy to implement first
3. **Create Migrations:** Database schema for subjects
4. **Build MVP:** Subject Generator (upload-based) + Browser
5. **Pilot Test:** With one course (e.g., fractions)
6. **Iterate:** Add linking, display rules, Play integration
7. **Scale:** Apply to all courses

## References

- [docs/MULTIMEDIA_ROADMAP.md](./MULTIMEDIA_ROADMAP.md) - Future exercise types
- [docs/AI_PROVIDERS.md](./AI_PROVIDERS.md) - AI integration patterns
- [supabase/functions/generate-course/index.ts](../supabase/functions/generate-course/index.ts) - Similar AI generation pattern

