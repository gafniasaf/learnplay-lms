import { createClient } from '@supabase/supabase-js';
import { MockupPolish } from '../supabase/functions/ai-job-runner/strategies/mockup_polish.ts';

// Polyfill Deno for Node execution
if (!globalThis.Deno) {
  // @ts-ignore
  globalThis.Deno = {
    env: {
      get: (key: string) => process.env[key],
    },
  };
}

// Validate required env vars
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌ Missing ANTHROPIC_API_KEY environment variable");
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY environment variable");
  process.exit(1);
}

async function main() {
  console.log("🧪 Starting Pipeline Test: 'Pet Adoption Tinder'...");

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Ensure bucket exists
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find(b => b.name === 'content')) {
      console.log("📦 Creating 'content' bucket...");
      await supabase.storage.createBucket('content', { public: true });
  }

  // 1. Seed the Plan
  const planId = crypto.randomUUID();
  const seedPlan = {
    id: planId,
    title: "Nomad Desk",
    description: "A premium marketplace for digital nomads to find and book co-working spaces worldwide. Features include: browsing spaces with stunning photos, filtering by amenities (fast wifi, standing desks, coffee), reading reviews, booking instantly, and managing reservations. Target audience: remote workers, freelancers, and startup founders who value aesthetic workspaces. The vibe should feel like a luxury travel app meets productivity tool.",
    status: "draft",
    // No design_system provided -> Art Director should trigger
    // No current_mockup_html -> UI Developer should start fresh
  };

  console.log(`🌱 Seeding Plan: ${planId}`);
  const { error: uploadError } = await supabase.storage
    .from('content')
    .upload(`planblueprints/${planId}.json`, JSON.stringify(seedPlan), { upsert: true, contentType: 'application/json' });

  if (uploadError) {
      console.error("❌ Upload Failed:", uploadError);
      // Check if bucket exists
      const { data: buckets } = await supabase.storage.listBuckets();
      console.log("Available buckets:", buckets?.map(b => b.name));
      process.exit(1);
  }

  // 2. Run Mockup Polish
  console.log("🤖 Invoking MockupPolish Strategy...");
  const strategy = new MockupPolish();
  await strategy.execute({
    jobId: "test-job",
    payload: {
      planBlueprintId: planId,
      ai_request: `Generate a COMPLETE multi-page application mockup with:

1. NAVIGATION: A sleek top navbar with logo, search bar, and user avatar. Include mobile hamburger menu.

2. HERO SECTION: Full-width hero with a stunning background image, headline, subheadline, and search/filter bar.

3. FEATURED SPACES: A grid of 6 space cards showing:
   - High-quality image
   - Space name & location
   - Rating (stars)
   - Price per day
   - Key amenities (icons)
   - "Book Now" CTA

4. FILTERS SIDEBAR: Collapsible sidebar with:
   - Location dropdown
   - Price range slider
   - Amenities checkboxes
   - Rating filter

5. SPACE DETAIL MODAL/SECTION: When clicking a card, show:
   - Image gallery
   - Full description
   - Amenities list
   - Reviews section
   - Booking calendar
   - "Reserve" button

6. FOOTER: Links, social icons, newsletter signup.

Make it feel like Airbnb meets WeWork - premium, trustworthy, aspirational.
Include ALL hover states, transitions, and responsive breakpoints.`
    }
  });

  // 3. Inspect Result
  console.log("🔍 Fetching Result...");
  const { data: blob } = await supabase.storage
    .from('content')
    .download(`planblueprints/${planId}.json`);
  
  const result = JSON.parse(await blob.text());

  console.log("\n🎨 GENERATED DESIGN SYSTEM:");
  console.log(JSON.stringify(result.design_system, null, 2));

  console.log("\n🖼️ GENERATED HTML SNIPPET:");
  console.log(result.current_mockup_html.substring(0, 500) + "...");
}

main().catch(console.error);

