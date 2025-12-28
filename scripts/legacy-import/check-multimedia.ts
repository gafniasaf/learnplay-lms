/**
 * Check what multimedia was actually found in the legacy course
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
  const connString = LEGACY_DB_URL.includes('sslmode=')
    ? LEGACY_DB_URL
    : `${LEGACY_DB_URL}${LEGACY_DB_URL.includes('?') ? '&' : '?'}sslmode=require`;

  const pool = new Pool({
    connectionString: connString,
    ssl: process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ? false : { rejectUnauthorized: false },
  });

  try {
    // Call the legacy function
    const result = await pool.query('SELECT get_course_content($1)', [courseId]);
    const legacy = result.rows[0].get_course_content;

    const subjects = legacy.subjects || [];
    console.log(`\n📋 Found ${subjects.length} subjects\n`);

    let totalCustomImg = 0;
    let totalHtmlImg = 0;
    let totalIframe = 0;
    let totalEmbed = 0;
    let totalVideo = 0;
    let totalHtmlFiles = 0;

    const multimediaSubjects: any[] = [];

    for (const subject of subjects) {
      // Check all possible content fields
      const content =
        (subject as any).study_text ||
        (subject as any).regexp_replace ||
        subject.mes_resource_content_text ||
        '';

      if (!content || content.length === 0) continue;

      const customImg = (content.match(/\$IMG\(["']/gi) || []).length;
      const htmlImg = (content.match(/<img[^>]*>/gi) || []).length;
      const iframe = (content.match(/<iframe[^>]*>/gi) || []).length;
      const embed = (content.match(/<embed[^>]*>/gi) || []).length;
      const video = (content.match(/<video[^>]*>/gi) || []).length;
      const htmlFiles = (content.match(/href=["'][^"']*\.html/gi) || []).length;

      if (customImg > 0 || htmlImg > 0 || iframe > 0 || embed > 0 || video > 0 || htmlFiles > 0) {
        multimediaSubjects.push({
          id: subject.mes_subject_id,
          name: subject.mes_subject_name,
          customImg,
          htmlImg,
          iframe,
          embed,
          video,
          htmlFiles,
          contentLength: content.length,
          contentPreview: content.substring(0, 500),
        });

        totalCustomImg += customImg;
        totalHtmlImg += htmlImg;
        totalIframe += iframe;
        totalEmbed += embed;
        totalVideo += video;
        totalHtmlFiles += htmlFiles;
      }
    }

    console.log(`\n📊 Multimedia Summary:`);
    console.log(`   Subjects with multimedia: ${multimediaSubjects.length}`);
    console.log(`   Total [$IMG(...)]: ${totalCustomImg}`);
    console.log(`   Total <img>: ${totalHtmlImg}`);
    console.log(`   Total <iframe>: ${totalIframe}`);
    console.log(`   Total <embed>: ${totalEmbed}`);
    console.log(`   Total <video>: ${totalVideo}`);
    console.log(`   Total HTML file links: ${totalHtmlFiles}`);

    if (multimediaSubjects.length > 0) {
      console.log(`\n📝 First 5 subjects with multimedia:`);
      multimediaSubjects.slice(0, 5).forEach((s, i) => {
        console.log(`\n   ${i + 1}. Subject ${s.id}: ${s.name}`);
        console.log(`      [$IMG]: ${s.customImg}, <img>: ${s.htmlImg}, <iframe>: ${s.iframe}, <embed>: ${s.embed}, <video>: ${s.video}, HTML files: ${s.htmlFiles}`);
        console.log(`      Content preview: ${s.contentPreview}...`);
      });
    } else {
      console.log(`\n⚠️  No multimedia found in any subjects.`);
      console.log(`\n   Checking if content is in a different field...`);
      
      // Check first subject structure
      if (subjects.length > 0) {
        const first = subjects[0];
        console.log(`\n   First subject keys: ${Object.keys(first).join(', ')}`);
        for (const key of Object.keys(first)) {
          const value = (first as any)[key];
          if (typeof value === 'string') {
            console.log(`   ${key}: length=${value.length}, preview="${value.substring(0, 300)}"`);
          } else if (value !== null && value !== undefined) {
            console.log(`   ${key}: ${typeof value} = ${JSON.stringify(value).substring(0, 200)}`);
          }
        }
        
        // Try to query the study_text directly from the database
        console.log(`\n   Attempting direct query for study_text...`);
        if (first.mes_studytext_id) {
          try {
            const directResult = await pool.query(
              `SELECT study_text FROM ec_products WHERE id = $1 LIMIT 1`,
              [first.mes_studytext_id]
            );
            if (directResult.rows.length > 0 && directResult.rows[0].study_text) {
              const directContent = directResult.rows[0].study_text;
              console.log(`   Direct study_text length: ${directContent.length}`);
              console.log(`   Direct study_text preview: ${directContent.substring(0, 500)}`);
              
              // Check for multimedia in direct content
              const directCustomImg = (directContent.match(/\$IMG\(["']/gi) || []).length;
              const directHtmlImg = (directContent.match(/<img[^>]*>/gi) || []).length;
              console.log(`   Direct content - [$IMG]: ${directCustomImg}, <img>: ${directHtmlImg}`);
            } else {
              console.log(`   No study_text found for studytext_id ${first.mes_studytext_id}`);
            }
          } catch (err) {
            console.log(`   Error querying directly: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});

