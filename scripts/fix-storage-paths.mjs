// Fix storage paths - copy {courseId}.json to {courseId}/course.json
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://eidcegehaswbtzrwzvfa.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ Set SUPABASE_SERVICE_ROLE_KEY env var');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const courses = ['math-basics-001', 'science-basics-001', 'english-basics-001'];

for (const courseId of courses) {
  console.log(`\n📦 Processing ${courseId}...`);
  
  // Try to download old format
  const { data: file, error: downloadErr } = await supabase.storage
    .from('courses')
    .download(`${courseId}.json`);
  
  if (downloadErr || !file) {
    console.log(`  ⚠️ ${courseId}.json not found, trying ${courseId}/course.json`);
    
    // Check if new format exists
    const { data: newFile, error: newErr } = await supabase.storage
      .from('courses')
      .download(`${courseId}/course.json`);
    
    if (newErr || !newFile) {
      console.log(`  ❌ No content found for ${courseId}`);
    } else {
      console.log(`  ✅ ${courseId}/course.json already exists`);
    }
    continue;
  }
  
  console.log(`  📄 Found ${courseId}.json, copying to ${courseId}/course.json`);
  
  const text = await file.text();
  
  // Upload to new path
  const { error: uploadErr } = await supabase.storage
    .from('courses')
    .upload(`${courseId}/course.json`, new Blob([text], { type: 'application/json' }), {
      upsert: true
    });
  
  if (uploadErr) {
    console.log(`  ❌ Upload failed:`, uploadErr.message);
  } else {
    console.log(`  ✅ Copied to ${courseId}/course.json`);
  }
}

console.log('\n✅ Done!');

