# Post-Generation Editing & Multi-Provider Support

## Overview

Comprehensive editing system for courses after AI generation, including:
- Multimedia in answer options (Visual MCQ, Audio MCQ, Video MCQ)
- Individual media regeneration with provider choice
- Bulk operations
- Provider comparison and switching

---

## **Multimedia in Answer Options**

### **Visual MCQ Support**

**Course JSON:**
```json
{
  "id": 8,
  "text": "Which liver lobe is shown?",
  "mode": "options",
  "stimulus": {
    "type": "image",
    "url": "liver/diagram-highlighted.png"
  },
  "optionMedia": [
    { "type": "image", "url": "liver/right-lobe.png", "alt": "Right lobe" },
    { "type": "image", "url": "liver/left-lobe.png", "alt": "Left lobe" },
    { "type": "image", "url": "liver/caudate.png", "alt": "Caudate lobe" },
    null  // Text option: "None of the above"
  ],
  "options": ["A", "B", "C", "None of the above"],
  "correctIndex": 0
}
```

**In Proposal:**
```
AI: Item 8 tests visual identification.
    I suggest Visual MCQ:
    - Stimulus: Main diagram with one lobe highlighted
    - Options: 4 images showing different lobes
    - Students must visually match
    
    Requires: 5 images total (1 stimulus + 4 options)
    Cost: $0.20
    Provider: DALL-E 3 (medical accuracy)
    
    Approve Visual MCQ for this item?
```

---

## **Media Regeneration UI**

### **Single Image Regeneration Modal**

```typescript
<Dialog>
  <DialogContent className="max-w-2xl">
    <DialogHeader>
      <DialogTitle>Regenerate Image</DialogTitle>
      <DialogDescription>
        Current: liver-anatomy.png • Used in Study Text 1
      </DialogDescription>
    </DialogHeader>
    
    <div className="grid grid-cols-2 gap-4">
      {/* Current Image */}
      <div>
        <Label>Current Image</Label>
        <img src={currentUrl} className="border rounded" />
        <p className="text-xs text-muted-foreground mt-2">
          Provider: DALL-E 3 • Generated: 2h ago • Cost: $0.04
        </p>
      </div>
      
      {/* Regeneration Options */}
      <div className="space-y-4">
        <div>
          <Label>Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai-dalle3">
                <div className="flex justify-between w-full">
                  <span>DALL-E 3</span>
                  <span className="text-xs text-muted-foreground">$0.04</span>
                </div>
              </SelectItem>
              <SelectItem value="replicate-sd">
                <div className="flex justify-between w-full">
                  <span>Stable Diffusion</span>
                  <span className="text-xs text-muted-foreground">$0.01</span>
                </div>
              </SelectItem>
              <SelectItem value="midjourney">
                <div className="flex justify-between w-full">
                  <span>Midjourney</span>
                  <span className="text-xs text-muted-foreground">$0.05</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label>Style</Label>
          <Select value={style} onValueChange={setStyle}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="diagram">Medical Diagram</SelectItem>
              <SelectItem value="photo">Realistic Photo</SelectItem>
              <SelectItem value="illustration">Simplified Illustration</SelectItem>
              <SelectItem value="3d">3D Render</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label>Custom Prompt (optional)</Label>
          <Textarea 
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Add specific requirements..."
            rows={3}
          />
        </div>
        
        {/* Cost Comparison */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            New: ${cost} • Time: ~{time}s
            {cost !== originalCost && (
              <span className="block mt-1">
                {cost < originalCost ? '💰 Saves' : '💸 Costs'} 
                ${Math.abs(cost - originalCost).toFixed(2)} vs current
              </span>
            )}
          </AlertDescription>
        </Alert>
      </div>
    </div>
    
    <DialogFooter>
      <Button variant="outline" onClick={onCancel}>Cancel</Button>
      <Button onClick={handleRegenerate} disabled={generating}>
        {generating ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>
        ) : (
          <><RefreshCw className="h-4 w-4 mr-2" />Regenerate (${cost})</>
        )}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## **Provider Plugin Architecture**

### **Adding New Provider (Example: Midjourney)**

**Step 1: Create Provider Module**
```typescript
// supabase/functions/_shared/providers/midjourney.ts

export const midjourneyProvider: MediaProvider = {
  id: 'midjourney',
  name: 'Midjourney',
  mediaTypes: ['image'],
  enabled: false,  // Enable when API key added
  
  async generate(params: GenerateParams) {
    const MIDJOURNEY_API_KEY = Deno.env.get("MIDJOURNEY_API_KEY");
    
    const response = await fetch("https://api.midjourney.com/v1/imagine", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MIDJOURNEY_API_KEY}`,
      },
      body: JSON.stringify({
        prompt: params.prompt,
        aspect_ratio: "1:1",
      }),
    });
    
    const data = await response.json();
    return {
      url: data.image_url,
      metadata: {
        job_id: data.id,
        revised_prompt: data.prompt_enhancement,
      },
    };
  },
  
  estimateCost: () => 0.05,
  avgGenerationTime: 60,
  qualityRating: 5,
  
  validateParams(params) {
    if (!params.prompt || params.prompt.length < 10) {
      return { valid: false, error: "Prompt too short for Midjourney" };
    }
    return { valid: true };
  },
};
```

**Step 2: Register Provider**
```typescript
// In provider registry
import { midjourneyProvider } from './providers/midjourney.ts';

providers['midjourney'] = midjourneyProvider;
```

**Step 3: Enable via Database**
```sql
insert into public.media_generation_providers values
('midjourney', 'Midjourney', array['image'], false, 0.05, 60, 5, 
 '{"api_version": "v1", "default_aspect": "1:1"}'::jsonb);

-- Enable when API key is configured
update public.media_generation_providers 
set enabled = true 
where id = 'midjourney';
```

**Step 4: AI Automatically Offers**
```
AI: For artistic liver illustrations, I can now use Midjourney!
    Would you like artistic style instead of medical diagram?
```

**That's it! No changes to proposal engine, chat, or UI!**

---

## **Complete Feature Matrix**

| Feature | MVP | Phase 2 | Phase 3 | Future |
|---------|-----|---------|---------|--------|
| Image in study texts | ✅ | ✅ | ✅ | ✅ |
| Image in stimulus | ✅ | ✅ | ✅ | ✅ |
| Image in options (Visual MCQ) | ❌ | ✅ | ✅ | ✅ |
| Audio in study texts | ❌ | ❌ | ✅ | ✅ |
| Audio in options (Audio MCQ) | ❌ | ❌ | ✅ | ✅ |
| Video in study texts | ❌ | ❌ | ❌ | ✅ |
| Video in options (Video MCQ) | ❌ | ❌ | ❌ | ✅ |
| Provider: DALL-E 3 | ✅ | ✅ | ✅ | ✅ |
| Provider: Stable Diffusion | ❌ | ✅ | ✅ | ✅ |
| Provider: Midjourney | ❌ | ❌ | ✅ | ✅ |
| Provider: ElevenLabs TTS | ❌ | ❌ | ✅ | ✅ |
| Provider: Replicate Video | ❌ | ❌ | ❌ | ✅ |
| Single regeneration | ✅ | ✅ | ✅ | ✅ |
| Bulk regeneration | ❌ | ✅ | ✅ | ✅ |
| Provider switching | ❌ | ✅ | ✅ | ✅ |
| Custom prompts | ✅ | ✅ | ✅ | ✅ |
| Duplicate detection | ❌ | ❌ | ✅ | ✅ |
| Content merging | ❌ | ❌ | ✅ | ✅ |
| Protocol linking | ❌ | ❌ | ❌ | ✅ |
| Curriculum alignment | ❌ | ❌ | ❌ | ✅ |

---

**This architecture ensures:**
- ✅ Easy to add multimedia in answers (just enable visual/audio/video MCQ enhancers)
- ✅ Full editing after generation with any provider
- ✅ Regenerate any media anytime with different providers/styles
- ✅ Scan for existing content to prevent duplication
- ✅ Link to protocols (when you build protocol system)
- ✅ Everything is a plugin - add features without breaking existing code

**Ready to implement?** 🎨🎬🎵

