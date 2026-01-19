/**
 * Probe Kevin's MES Supabase to explore the full Expertcollege content.
 * 
 * Usage: npx tsx scripts/probe-mes-supabase.ts
 * 
 * Kevin's credentials:
 * - URL: https://yqpqdtedhoffgmurpped.supabase.co
 * - Anon Key: sb_publishable_s6WSybdYV_UqHRGLltgQgg_XZGHY-gD
 */

import { createClient } from "@supabase/supabase-js";

const MES_SUPABASE_URL = "https://yqpqdtedhoffgmurpped.supabase.co";

// Kevin's publishable key (this worked in first run)
const MES_ANON_KEY_ALT = "sb_publishable_s6WSybdYV_UqHRGLltgQgg_XZGHY-gD";

async function main() {
  console.log("🔍 Probing Kevin's MES Supabase...\n");
  console.log("URL:", MES_SUPABASE_URL);
  
  // Try with the standard JWT-like anon key (derived from project ref)
  const supabase = createClient(MES_SUPABASE_URL, MES_ANON_KEY_ALT);
  
  // 1. List available tables
  console.log("\n📋 Checking mes_course table...");
  try {
    const { data: courses, error: coursesErr, count } = await supabase
      .from("mes_course")
      .select("mes_course_id, mes_course_name, mes_course_language", { count: "exact" })
      .limit(10);
    
    if (coursesErr) {
      console.error("❌ mes_course error:", coursesErr.message);
    } else {
      console.log(`✅ Found ${count} courses. Sample:`);
      console.log(JSON.stringify(courses?.slice(0, 5), null, 2));
    }
  } catch (e: any) {
    console.error("❌ Exception:", e.message);
  }

  // 2. Check mes_topic table
  console.log("\n📋 Checking mes_topic table...");
  try {
    const { data: topics, error: topicsErr, count } = await supabase
      .from("mes_topic")
      .select("mes_topic_id, mes_topic_name, mes_topic_course_id", { count: "exact" })
      .limit(10);
    
    if (topicsErr) {
      console.error("❌ mes_topic error:", topicsErr.message);
    } else {
      console.log(`✅ Found ${count} topics. Sample:`);
      console.log(JSON.stringify(topics?.slice(0, 5), null, 2));
    }
  } catch (e: any) {
    console.error("❌ Exception:", e.message);
  }

  // 3. Check mes_exercise table
  console.log("\n📋 Checking mes_exercise table...");
  try {
    const { data: exercises, error: exercisesErr, count } = await supabase
      .from("mes_exercise")
      .select("mes_exercise_id, mes_exercise_name, mes_exercise_type", { count: "exact" })
      .limit(10);
    
    if (exercisesErr) {
      console.error("❌ mes_exercise error:", exercisesErr.message);
    } else {
      console.log(`✅ Found ${count} exercises. Sample:`);
      console.log(JSON.stringify(exercises?.slice(0, 5), null, 2));
    }
  } catch (e: any) {
    console.error("❌ Exception:", e.message);
  }

  // 4. Check mes_subject (studytexts) table
  console.log("\n📋 Checking mes_subject table...");
  try {
    const { data: subjects, error: subjectsErr, count } = await supabase
      .from("mes_subject")
      .select("mes_subject_id, mes_subject_name, mes_subject_course_id", { count: "exact" })
      .limit(10);
    
    if (subjectsErr) {
      console.error("❌ mes_subject error:", subjectsErr.message);
    } else {
      console.log(`✅ Found ${count} subjects. Sample:`);
      console.log(JSON.stringify(subjects?.slice(0, 5), null, 2));
    }
  } catch (e: any) {
    console.error("❌ Exception:", e.message);
  }

  // 5. Check mes_resource table (contains actual content)
  console.log("\n📋 Checking mes_resource table...");
  try {
    const { data: resources, error: resourcesErr, count } = await supabase
      .from("mes_resource")
      .select("mes_resource_key, mes_resource_language, mes_resource_displayname", { count: "exact" })
      .limit(10);
    
    if (resourcesErr) {
      console.error("❌ mes_resource error:", resourcesErr.message);
    } else {
      console.log(`✅ Found ${count} resources. Sample:`);
      console.log(JSON.stringify(resources?.slice(0, 5), null, 2));
    }
  } catch (e: any) {
    console.error("❌ Exception:", e.message);
  }

  // 6. Try the get_course_content RPC function
  console.log("\n📋 Trying get_course_content(169) RPC...");
  try {
    const { data: courseContent, error: rpcErr } = await supabase
      .rpc("get_course_content", { p_course_id: 169 });
    
    if (rpcErr) {
      console.error("❌ RPC error:", rpcErr.message);
    } else {
      console.log("✅ RPC returned data. Structure:");
      if (courseContent) {
        console.log("- course:", Array.isArray(courseContent.course) ? courseContent.course.length : typeof courseContent.course);
        console.log("- topics:", Array.isArray(courseContent.topics) ? courseContent.topics.length : typeof courseContent.topics);
        console.log("- subjects:", Array.isArray(courseContent.subjects) ? courseContent.subjects.length : typeof courseContent.subjects);
        
        // Show a sample
        if (courseContent.course?.[0]) {
          console.log("\nCourse sample:", JSON.stringify(courseContent.course[0], null, 2));
        }
        if (courseContent.topics?.[0]) {
          console.log("\nFirst topic sample:", JSON.stringify(courseContent.topics[0], null, 2));
        }
        if (courseContent.subjects?.[0]) {
          console.log("\nFirst subject sample (truncated):");
          const subj = { ...courseContent.subjects[0] };
          if (typeof subj.regexp_replace === 'string' && subj.regexp_replace.length > 500) {
            subj.regexp_replace = subj.regexp_replace.slice(0, 500) + "... [TRUNCATED]";
          }
          console.log(JSON.stringify(subj, null, 2));
        }
      }
    }
  } catch (e: any) {
    console.error("❌ RPC Exception:", e.message);
  }

  // 7. List all "e-Xpert mbo" courses (non-copy)
  console.log("\n📋 Finding original 'e-Xpert mbo AG' courses (not copies)...");
  try {
    const { data: mboCourses, error: mboErr, count } = await supabase
      .from("mes_course")
      .select("mes_course_id, mes_course_name, mes_course_language", { count: "exact" })
      .ilike("mes_course_name", "e-Xpert mbo AG:%")
      .not("mes_course_name", "ilike", "Copy of%")
      .order("mes_course_name")
      .limit(50);
    
    if (mboErr) {
      console.error("❌ Error:", mboErr.message);
    } else {
      console.log(`✅ Found ${count} original 'e-Xpert mbo AG' courses. Sample:`);
      mboCourses?.slice(0, 30).forEach((c: any) => {
        console.log(`  - [${c.mes_course_id}] ${c.mes_course_name}`);
      });
    }
  } catch (e: any) {
    console.error("❌ Exception:", e.message);
  }

  // 8. Try get_course_content with a specific course ID (6821 = Introductie from the list)
  console.log("\n📋 Trying get_course_content(6821) - Anatomie Introductie...");
  try {
    const { data: courseContent, error: rpcErr } = await supabase
      .rpc("get_course_content", { p_course_id: 6821 });
    
    if (rpcErr) {
      console.error("❌ RPC error:", rpcErr.message);
    } else if (courseContent) {
      console.log("✅ RPC returned data!");
      console.log("- course:", JSON.stringify(courseContent.course, null, 2));
      console.log("- topics count:", courseContent.topics?.length || 0);
      console.log("- subjects count:", courseContent.subjects?.length || 0);
      
      // Show first topic with exercises if any
      const topicWithExercise = courseContent.topics?.find((t: any) => t.mes_exercise_id);
      if (topicWithExercise) {
        console.log("\nTopic with exercise:", JSON.stringify(topicWithExercise, null, 2));
      }
      
      // Show first subject with content
      if (courseContent.subjects?.[0]) {
        const subj = { ...courseContent.subjects[0] };
        if (typeof subj.regexp_replace === 'string') {
          subj.content_preview = subj.regexp_replace.slice(0, 800);
          delete subj.regexp_replace;
        }
        console.log("\nFirst subject:", JSON.stringify(subj, null, 2));
      }
    }
  } catch (e: any) {
    console.error("❌ RPC Exception:", e.message);
  }

  // 9. Try a simpler course (one from the first few)
  console.log("\n📋 Trying get_course_content(1) - e-Xpert Triage NTS...");
  try {
    const { data: courseContent, error: rpcErr } = await supabase
      .rpc("get_course_content", { p_course_id: 1 });
    
    if (rpcErr) {
      console.error("❌ RPC error:", rpcErr.message);
    } else if (courseContent) {
      console.log("✅ RPC returned data!");
      console.log("- course:", JSON.stringify(courseContent.course, null, 2));
      console.log("- topics count:", courseContent.topics?.length || 0);
      console.log("- subjects count:", courseContent.subjects?.length || 0);
    }
  } catch (e: any) {
    console.error("❌ RPC Exception:", e.message);
  }

  // 10. Check for alternative table names - maybe views?
  console.log("\n📋 Checking for views/alternative tables...");
  const tablesToCheck = [
    "mes_topicexercise",
    "mes_studytext", 
    "mes_subjectstudytext",
    "courses",
    "topics",
    "exercises"
  ];
  
  for (const table of tablesToCheck) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });
      
      if (error) {
        console.log(`  - ${table}: ❌ ${error.message.slice(0, 50)}`);
      } else {
        console.log(`  - ${table}: ✅ ${count} rows`);
      }
    } catch (e: any) {
      console.log(`  - ${table}: ❌ ${e.message.slice(0, 50)}`);
    }
  }

  console.log("\n✅ Probe complete.");
}

main().catch((e) => {
  console.error("Fatal error:", e.message);
  process.exit(1);
});
