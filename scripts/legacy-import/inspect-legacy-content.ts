/**
 * Inspect raw legacy course content to find HTML5 animations and multimedia
 */

import { loadLearnPlayEnv } from '../../tests/helpers/parse-learnplay-env';
import { loadLocalEnvForTests } from '../../tests/helpers/load-local-env';
import { Pool } from 'pg';

loadLocalEnvForTests();
loadLearnPlayEnv();

const LEGACY_DB_URL = process.env.LEGACY_DATABASE_URL;

if (!LEGACY_DB_URL) {
  throw new Error('LEGACY_DATABASE_URL is required');
}

const courseId = parseInt(process.argv[2] || '4', 10);

async function main() {
  // Ensure SSL mode is set in connection string
  const connString = LEGACY_DB_URL.includes('sslmode=') 
    ? LEGACY_DB_URL 
    : `${LEGACY_DB_URL}${LEGACY_DB_URL.includes('?') ? '&' : '?'}sslmode=require`;
  
  const pool = new Pool({ 
    connectionString: connString,
    ssl: process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ? false : { rejectUnauthorized: false }
  });
  
  try {
    // Call the legacy function
    const result = await pool.query('SELECT get_course_content($1)', [courseId]);
    const legacy = result.rows[0].get_course_content;
    
    // Check subjects (study texts) for HTML5/embed content
    const subjects = legacy.subjects || [];
    console.log(`\n📋 Found ${subjects.length} subjects\n`);
    
    // Find subjects with actual content
    const subjectsWithContent = subjects.filter(s => {
      const content = s.regexp_replace || s.mes_resource_content_text || '';
      return content.length > 0;
    });
    
    console.log(`\n📝 Found ${subjectsWithContent.length} subjects with content (out of ${subjects.length})`);
    
    if (subjectsWithContent.length > 0) {
      console.log('\n📝 Sample subject with content:');
      const sample = subjectsWithContent[0];
      const sampleContent = sample.regexp_replace || sample.mes_resource_content_text || '';
      console.log(JSON.stringify({
        mes_subject_id: sample.mes_subject_id,
        mes_subject_name: sample.mes_subject_name,
        content_length: sampleContent.length,
        content_preview: sampleContent.substring(0, 500)
      }, null, 2));
      
      // Check for HTML5/embed patterns in this sample
      console.log('\n🔍 Checking for multimedia patterns:');
      const patterns = {
        iframe: /<iframe[^>]*>/i.test(sampleContent),
        embed: /<embed[^>]*>/i.test(sampleContent),
        video: /<video[^>]*>/i.test(sampleContent),
        canvas: /<canvas[^>]*>/i.test(sampleContent),
        object: /<object[^>]*>/i.test(sampleContent),
        htmlFile: /\.html["']|\.htm["']|href=["'][^"']*\.html/i.test(sampleContent),
        html5: /html5|animation|interactive/i.test(sampleContent),
      };
      console.log(JSON.stringify(patterns, null, 2));
      
      // Show full content of first subject with content
      console.log('\n📄 Full content of first subject:');
      console.log(sampleContent);
    }
    
    let foundAnimations = 0;
    let foundEmbeds = 0;
    let foundVideos = 0;
    let foundIframes = 0;
    let foundCanvas = 0;
    let foundSvg = 0;
    
    // Check all subjects
    for (let i = 0; i < subjects.length; i++) {
      const subject = subjects[i];
      // Check both fields - the SQL function might return content in regexp_replace
      const content = subject.regexp_replace || subject.mes_resource_content_text || '';
      
      // Check for various HTML5/multimedia patterns
      const hasIframe = /<iframe[^>]*>/i.test(content);
      const hasEmbed = /<embed[^>]*>/i.test(content);
      const hasVideo = /<video[^>]*>/i.test(content);
      const hasCanvas = /<canvas[^>]*>/i.test(content);
      const hasSvg = /<svg[^>]*>/i.test(content);
      const hasObject = /<object[^>]*>/i.test(content);
      const hasHtml5 = /html5|animation|interactive/i.test(content);
      const hasHtmlFile = /\.html["']|\.htm["']|href=["'][^"']*\.html|href=["'][^"']*\.htm/i.test(content);
      const hasSwf = /\.swf["']|flash/i.test(content);
      
      if (hasIframe || hasEmbed || hasVideo || hasCanvas || hasSvg || hasObject || hasHtml5 || hasHtmlFile || hasSwf) {
        console.log(`\n🔍 Subject ${i + 1} (ID: ${subject.mes_subject_id}):`);
        console.log(`   Title: ${subject.mes_subject_name || subject.mes_resource_displayname || 'N/A'}`);
        
        if (hasIframe) {
          foundIframes++;
          const matches = content.match(/<iframe[^>]*src="([^"]+)"[^>]*>/gi);
          console.log(`   ✅ Contains <iframe>: ${matches?.length || 0} found`);
          if (matches) {
            matches.slice(0, 3).forEach(m => {
              const srcMatch = m.match(/src="([^"]+)"/i);
              if (srcMatch) console.log(`      - ${srcMatch[1].substring(0, 100)}`);
            });
          }
        }
        
        if (hasEmbed) {
          foundEmbeds++;
          const matches = content.match(/<embed[^>]*src="([^"]+)"[^>]*>/gi);
          console.log(`   ✅ Contains <embed>: ${matches?.length || 0} found`);
          if (matches) {
            matches.slice(0, 3).forEach(m => {
              const srcMatch = m.match(/src="([^"]+)"/i);
              if (srcMatch) console.log(`      - ${srcMatch[1].substring(0, 100)}`);
            });
          }
        }
        
        if (hasVideo) {
          foundVideos++;
          console.log(`   ✅ Contains <video>`);
        }
        
        if (hasCanvas) {
          foundCanvas++;
          console.log(`   ✅ Contains <canvas>`);
        }
        
        if (hasSvg) {
          foundSvg++;
          console.log(`   ✅ Contains <svg>`);
        }
        
        if (hasObject) {
          console.log(`   ✅ Contains <object>`);
        }
        
        if (hasHtml5) {
          foundAnimations++;
          console.log(`   ✅ Contains HTML5/animation keywords`);
        }
        
        if (hasHtmlFile) {
          foundAnimations++;
          const matches = content.match(/href=["']([^"']*\.html[^"']*)["']/gi) || content.match(/["']([^"']*\.html[^"']*)["']/gi);
          console.log(`   ✅ Contains HTML file links: ${matches?.length || 0} found`);
          if (matches) {
            matches.slice(0, 3).forEach(m => {
              const urlMatch = m.match(/["']([^"']+)["']/i);
              if (urlMatch) console.log(`      - ${urlMatch[1].substring(0, 150)}`);
            });
          }
        }
        
        if (hasSwf) {
          foundAnimations++;
          console.log(`   ✅ Contains Flash/SWF references`);
        }
        
        // Show a sample of the content (longer sample for HTML5 content)
        const sample = content.substring(0, 1000).replace(/\s+/g, ' ');
        console.log(`   Sample: ${sample}...`);
      }
    }
    
    // Summary
    console.log(`\n\n📊 Summary:`);
    console.log(`   Total subjects checked: ${subjects.length}`);
    console.log(`   Subjects with <iframe>: ${foundIframes}`);
    console.log(`   Subjects with <embed>: ${foundEmbeds}`);
    console.log(`   Subjects with <video>: ${foundVideos}`);
    console.log(`   Subjects with <canvas>: ${foundCanvas}`);
    console.log(`   Subjects with <svg>: ${foundSvg}`);
    console.log(`   Subjects with HTML5/animation/HTML files: ${foundAnimations}`);
    
    // Check all subjects for multimedia (including HTML file links)
    let totalMultimedia = 0;
    for (const subject of subjects) {
      const content = subject.regexp_replace || subject.mes_resource_content_text || '';
      if (
        /<iframe[^>]*>/i.test(content) ||
        /<embed[^>]*>/i.test(content) ||
        /<video[^>]*>/i.test(content) ||
        /<canvas[^>]*>/i.test(content) ||
        /<object[^>]*>/i.test(content) ||
        /\.html["']|\.htm["']|href=["'][^"']*\.html/i.test(content) ||
        /html5|animation|interactive/i.test(content)
      ) {
        totalMultimedia++;
      }
    }
    
    console.log(`\n   Total subjects with multimedia (all ${subjects.length}): ${totalMultimedia}`);
    
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});

