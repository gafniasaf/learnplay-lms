import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await supabase.storage.from('content').list('planblueprints');
  if (!data || data.length === 0) {
    console.log('No plans found');
    return;
  }

  const latest = data.sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0];

  const { data: blob } = await supabase.storage
    .from('content')
    .download(`planblueprints/${latest.name}`);

  if (!blob) {
    console.log('Failed to download');
    return;
  }

  const plan = JSON.parse(await blob.text());
  
  // Get the HTML content
  let html = plan.current_mockup_html || '';
  
  // If it's still escaped (from JSON), unescape it
  if (html.includes('\\n')) {
    html = html.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  
  // Build the full HTML document
  const parts = [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <title>' + (plan.title || 'Preview') + '</title>',
    '</head>',
    '<body>',
    html,
    '</body>',
    '</html>'
  ];
  
  const fullHtml = parts.join('\n');

  fs.writeFileSync('test-output.html', fullHtml, 'utf8');
  console.log('✅ Saved to test-output.html');
  console.log('   Title:', plan.title);
  console.log('   Theme:', plan.design_system?.themeName);
  console.log('   Review Score:', plan.review_score);
  console.log('   HTML Length:', html.length);
}

main().catch(console.error);

