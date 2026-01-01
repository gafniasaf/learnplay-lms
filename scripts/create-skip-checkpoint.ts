#!/usr/bin/env tsx
/**
 * Create a checkpoint that skips already-synced courses
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const MES_URL = 'https://yqpqdtedhoffgmurpped.supabase.co';
const MES_KEY = 'sb_publishable_s6WSybdYV_UqHRGLltgQgg_XZGHY-gD';

const SKIP_COUNT = parseInt(process.argv[2] || '5742', 10);

async function createSkipCheckpoint() {
  const supabase = createClient(MES_URL, MES_KEY);
  
  console.log('Fetching course list from MES...');
  
  // Paginate to get all courses (Supabase default limit is 1000)
  const allCourses: { mes_course_id: number }[] = [];
  let offset = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data: courses, error } = await supabase
      .from('mes_course')
      .select('mes_course_id')
      .order('mes_course_id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    
    if (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
    
    if (!courses || courses.length === 0) break;
    
    allCourses.push(...courses);
    console.log(`  Fetched ${allCourses.length} courses...`);
    
    if (courses.length < pageSize) break;
    offset += pageSize;
  }
  
  const courses = allCourses;
  console.log('Total courses in MES:', courses.length);
  
  if (!courses || courses.length === 0) {
    console.error('No courses found!');
    process.exit(1);
  }
  
  // Take first N course IDs (the ones already synced)
  const processedIds = courses.slice(0, SKIP_COUNT).map(c => c.mes_course_id);
  
  console.log(`Will skip first ${processedIds.length} courses`);
  console.log(`First ID: ${processedIds[0]}, Last skipped ID: ${processedIds[processedIds.length - 1]}`);
  console.log(`Remaining courses to process: ${courses.length - SKIP_COUNT}`);
  
  // Create checkpoint
  const checkpoint = {
    version: 1,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_course_id: processedIds[processedIds.length - 1],
    processed_ids: processedIds,
    failed_ids: {},
    stats: {
      successCount: SKIP_COUNT,
      failedCount: 0,
      itemsImported: 0,
      studyTextsImported: 0,
      imagesMigrated: 0,
      imagesFailedCount: 0
    },
    courseTimes: []
  };
  
  const checkpointPath = path.resolve('artifacts/mes-migration-checkpoint.json');
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
  
  console.log(`✅ Checkpoint created at ${checkpointPath}`);
  console.log(`Ready to resume - will process ${courses.length - SKIP_COUNT} remaining courses`);
}

createSkipCheckpoint().catch(console.error);

