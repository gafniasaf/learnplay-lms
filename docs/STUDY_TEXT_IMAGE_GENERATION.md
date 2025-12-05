# Study Text Image Generation

## Current State

Study texts are generated with `[IMAGE:description]` placeholders like:
```
[IMAGE:What is the Liver? illustration 1]
```

These placeholders show as broken images because they're not real URLs yet.

## Solution: Automatic Image Generation

### Approach 1: Post-Processing (Recommended)

After ai-job-runner completes course generation:

1. **Parse study texts** for `[IMAGE:description]` markers
2. **Submit ai_media_jobs** for each image
3. **Replace placeholders** with actual URLs after generation
4. **Update course JSON** in Storage

**Implementation:**

Add to `supabase/functions/ai-job-runner/index.ts` after catalog update:

```typescript
// After updateCatalog() call

// Extract and generate images for study texts
if (courseJson.studyTexts && courseJson.studyTexts.length > 0) {
  logInfo("Processing study text images", jobCtx);
  
  for (const studyText of courseJson.studyTexts) {
    const imageMatches = studyText.content.matchAll(/\[IMAGE:(.*?)\]/g);
    
    for (const match of imageMatches) {
      const imageDescription = match[1];
      
      // Submit media job for this image
      const { data: mediaJob } = await supabase
        .from('ai_media_jobs')
        .insert({
          course_id: job.course_id,
          item_id: -1,  // -1 indicates study text image
          media_type: 'image',
          prompt: `Educational diagram for ${req.subject}: ${imageDescription}`,
          provider: 'openai',
          metadata: { study_text_id: studyText.id, original_marker: match[0] }
        })
        .select()
        .single();
      
      logInfo("Submitted image generation job for study text", { 
        ...jobCtx, 
        mediaJobId: mediaJob.id,
        description: imageDescription 
      });
    }
  }
  
  // Note: Images will be generated async by ai-media-runner
  // A separate process should poll completed media jobs and update course JSON
}
```

### Approach 2: Inline Generation (Slower but Complete)

Generate all images BEFORE saving the course:

```typescript
// In generate-course function, after AI returns course JSON

const studyTexts = courseJson.studyTexts || [];

for (const studyText of studyTexts) {
  const imageMatches = [...studyText.content.matchAll(/\[IMAGE:(.*?)\]/g)];
  
  for (const match of imageMatches) {
    const description = match[1];
    
    // Generate image with DALL-E
    const imageResp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `Educational diagram for students: ${description}`,
        size: "1024x1024",
        quality: "standard",
      }),
    });
    
    const imageData = await imageResp.json();
    const imageUrl = imageData.data?.[0]?.url;
    
    if (imageUrl) {
      // Download and upload to Storage
      const imgBlob = await (await fetch(imageUrl)).blob();
      const imgPath = `${courseId}/assets/images/study-${studyText.id}-${Date.now()}.png`;
      
      await supabase.storage.from("courses").upload(imgPath, imgBlob, { upsert: true });
      
      const { data: { publicUrl } } = supabase.storage.from("courses").getPublicUrl(imgPath);
      
      // Replace [IMAGE:description] with actual URL
      studyText.content = studyText.content.replace(
        match[0],
        `[IMAGE:${imgPath}]`  // Store relative path
      );
    }
  }
}

// Now save course with real image paths
```

### Approach 3: Manual in UI (Current Workaround)

Users can manually generate images via StudyTextsEditor:

1. Edit study text
2. Click where `[IMAGE:description]` is
3. Change to actual image URL or use "Generate with AI" in StimulusEditor

## Recommended Implementation

**For MVP:** Use Approach 1 (Post-Processing)
- Fast course generation
- Images generate in background
- User can use course immediately
- Images appear when ready (via polling/webhook)

**For Production:** Use Approach 2 (Inline Generation)
- Complete courses with all images
- Longer wait time (~2-3 min per course)
- Better UX - no missing images

## Implementation Steps

1. Modify `generate-course/index.ts` to generate images inline
2. OR modify `ai-job-runner/index.ts` to queue image jobs
3. Add image replacement logic to update course JSON after images generate
4. Test with new course generation

Would you like me to implement Approach 2 (inline generation) so all images are ready when the course is saved?

