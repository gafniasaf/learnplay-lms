#!/usr/bin/env npx tsx
/**
 * Seed script for Dawn LMS entity_records table
 * Populates sample Courses, Classes, Assignments, Students, Tags, etc.
 */

import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.resolve(__dirname, "../supabase/.deploy.env");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^(\w+)=(.*)$/);
  if (match) {
    process.env[match[1]] = match[2];
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL!;
const AGENT_TOKEN = process.env.AGENT_TOKEN!;
const ORGANIZATION_ID = process.env.ORGANIZATION_ID!;

if (!SUPABASE_URL || !AGENT_TOKEN || !ORGANIZATION_ID) {
  console.error("Missing required env vars: SUPABASE_URL, AGENT_TOKEN, ORGANIZATION_ID");
  process.exit(1);
}

interface EntityRecord {
  entity: string;
  title: string;
  data: Record<string, unknown>;
}

// Sample data for each entity type
const seedData: EntityRecord[] = [
  // === COURSES ===
  {
    entity: "course",
    title: "Introduction to Fractions",
    data: {
      subject: "Mathematics",
      difficulty: "elementary",
      grade_range: "3-5",
      catalog_tags: ["fractions", "numbers", "math-fundamentals"],
      published: true,
      version_number: 1,
      format_schema_version: "v2",
      content_json: {
        modules: [
          {
            id: "mod-1",
            title: "What Are Fractions?",
            objectives: ["Understand parts of a whole", "Identify numerator and denominator"],
            items: [
              {
                id: "item-1-1",
                item_type: "MCQ",
                stem: "A pizza is cut into 8 equal slices. You eat 3 slices. What fraction of the pizza did you eat?",
                options: ["3/8", "8/3", "5/8", "3/5"],
                correct_answer: "3/8",
                reference: "The numerator (3) represents slices eaten. The denominator (8) represents total slices.",
                difficulty_score: 0.3
              },
              {
                id: "item-1-2",
                item_type: "visual_mcq",
                stem: "Which picture shows 1/4 shaded?",
                options: ["A", "B", "C", "D"],
                correct_answer: "B",
                media: { image_url: "/media/fractions/quarter-options.png" },
                difficulty_score: 0.2
              }
            ]
          },
          {
            id: "mod-2",
            title: "Comparing Fractions",
            objectives: ["Compare fractions with same denominator", "Use symbols < > ="],
            items: [
              {
                id: "item-2-1",
                item_type: "MCQ",
                stem: "Which is greater: 2/5 or 4/5?",
                options: ["2/5", "4/5", "They are equal"],
                correct_answer: "4/5",
                reference: "When denominators are the same, compare numerators. 4 > 2, so 4/5 > 2/5.",
                difficulty_score: 0.4
              }
            ]
          }
        ],
        study_texts: [
          { module_id: "mod-1", content: "Fractions represent parts of a whole. The top number is the numerator, and the bottom number is the denominator." }
        ]
      },
      metadata: { author: "AI Generator", created_at: new Date().toISOString() }
    }
  },
  {
    entity: "course",
    title: "Reading Comprehension Basics",
    data: {
      subject: "English Language Arts",
      difficulty: "elementary",
      grade_range: "2-4",
      catalog_tags: ["reading", "comprehension", "literacy"],
      published: true,
      version_number: 1,
      format_schema_version: "v2",
      content_json: {
        modules: [
          {
            id: "mod-1",
            title: "Finding the Main Idea",
            objectives: ["Identify the main idea of a passage", "Distinguish main idea from details"],
            items: [
              {
                id: "item-1-1",
                item_type: "MCQ",
                stem: "Read the passage and select the main idea: 'Dogs make great pets. They are loyal, playful, and protective. Many families love having dogs.'",
                options: [
                  "Dogs are playful",
                  "Dogs make great pets",
                  "Families have dogs",
                  "Dogs are protective"
                ],
                correct_answer: "Dogs make great pets",
                reference: "The main idea is the central point. The other options are supporting details.",
                difficulty_score: 0.35
              }
            ]
          }
        ]
      },
      metadata: { author: "AI Generator", created_at: new Date().toISOString() }
    }
  },
  {
    entity: "course",
    title: "Introduction to Life Science",
    data: {
      subject: "Science",
      difficulty: "middle",
      grade_range: "6-8",
      catalog_tags: ["biology", "life-science", "cells"],
      published: false,
      version_number: 1,
      format_schema_version: "v2",
      content_json: { modules: [] },
      metadata: { author: "AI Generator", created_at: new Date().toISOString(), status: "draft" }
    }
  },

  // === CLASSES ===
  {
    entity: "class",
    title: "Mrs. Johnson's 4th Grade",
    data: {
      name: "Mrs. Johnson's 4th Grade",
      teacher_id: "teacher-001",
      grade_level: "4",
      subject: "All Subjects",
      join_code: "MATH4J",
      member_ids: ["student-001", "student-002", "student-003"],
      active: true
    }
  },
  {
    entity: "class",
    title: "Mr. Smith's 7th Grade Science",
    data: {
      name: "Mr. Smith's 7th Grade Science",
      teacher_id: "teacher-002",
      grade_level: "7",
      subject: "Science",
      join_code: "SCI7S",
      member_ids: ["student-004", "student-005"],
      active: true
    }
  },

  // === STUDENT PROFILES ===
  {
    entity: "student-profile",
    title: "Emma Wilson",
    data: {
      user_id: "student-001",
      full_name: "Emma Wilson",
      avatar_url: "/avatars/emma.png",
      grade_level: "4",
      parent_id: "parent-001",
      linked_child_code: "EMMA2024",
      goals: [
        { type: "weekly_minutes", target: 120, current: 85 }
      ],
      achievements: [
        { id: "first-session", label: "First Session Complete", earned_at: "2024-01-15" },
        { id: "streak-7", label: "7-Day Streak", earned_at: "2024-01-22" }
      ],
      mastery_tracker: {
        "fractions": 0.72,
        "reading-comprehension": 0.65
      }
    }
  },
  {
    entity: "student-profile",
    title: "Liam Chen",
    data: {
      user_id: "student-002",
      full_name: "Liam Chen",
      avatar_url: "/avatars/liam.png",
      grade_level: "4",
      parent_id: "parent-002",
      linked_child_code: "LIAM2024",
      goals: [
        { type: "weekly_minutes", target: 100, current: 110 }
      ],
      achievements: [
        { id: "first-session", label: "First Session Complete", earned_at: "2024-01-10" },
        { id: "perfect-score", label: "Perfect Score", earned_at: "2024-01-18" }
      ],
      mastery_tracker: {
        "fractions": 0.88,
        "reading-comprehension": 0.75
      }
    }
  },

  // === ASSIGNMENTS ===
  {
    entity: "assignment",
    title: "Fractions Practice Week 3",
    data: {
      title: "Fractions Practice Week 3",
      course_id: "course-fractions-001",
      class_id: "class-johnson-4th",
      teacher_id: "teacher-001",
      due_date: "2024-02-01",
      status: "active",
      assigned_students: ["student-001", "student-002", "student-003"],
      skill_focus: ["comparing-fractions", "equivalent-fractions"],
      adaptive_settings: { min_items: 10, max_items: 20, target_mastery: 0.8 },
      auto_assign_enabled: false
    }
  },
  {
    entity: "assignment",
    title: "Reading Comprehension Unit 1",
    data: {
      title: "Reading Comprehension Unit 1",
      course_id: "course-reading-001",
      class_id: "class-johnson-4th",
      teacher_id: "teacher-001",
      due_date: "2024-02-05",
      status: "scheduled",
      assigned_students: ["student-001", "student-002"],
      skill_focus: ["main-idea", "inference"],
      adaptive_settings: { min_items: 8, max_items: 15, target_mastery: 0.75 },
      auto_assign_enabled: true
    }
  },

  // === TAGS ===
  {
    entity: "tag",
    title: "Mathematics",
    data: {
      tag_type: "subject",
      slug: "mathematics",
      label: "Mathematics",
      enabled: true,
      display_order: 1,
      is_active: true,
      pending_approval: false
    }
  },
  {
    entity: "tag",
    title: "Fractions",
    data: {
      tag_type: "topic",
      slug: "fractions",
      label: "Fractions",
      enabled: true,
      display_order: 10,
      is_active: true,
      pending_approval: false
    }
  },
  {
    entity: "tag",
    title: "Reading Comprehension",
    data: {
      tag_type: "skill",
      slug: "reading-comprehension",
      label: "Reading Comprehension",
      enabled: true,
      display_order: 5,
      is_active: true,
      pending_approval: false
    }
  },
  {
    entity: "tag",
    title: "Critical Thinking (Pending)",
    data: {
      tag_type: "skill",
      slug: "critical-thinking",
      label: "Critical Thinking",
      enabled: false,
      display_order: 20,
      is_active: false,
      pending_approval: true
    }
  },

  // === JOB TICKETS (sample completed/failed jobs) ===
  {
    entity: "job-ticket",
    title: "Generate Course: Life Science",
    data: {
      job_type: "generate_course",
      status: "completed",
      target_id: "course-life-science-001",
      payload: { subject: "Life Science", difficulty: "middle", grade_range: "6-8" },
      result: { success: true, items_generated: 25, modules_created: 4 },
      progress: 100,
      phase: "complete"
    }
  },
  {
    entity: "job-ticket",
    title: "Media Generation Failed",
    data: {
      job_type: "media_runner",
      status: "failed",
      target_id: "course-fractions-001",
      payload: { media_types: ["image", "audio"] },
      result: null,
      progress: 45,
      phase: "image_generation",
      error_message: "Rate limit exceeded. Please retry in 60 seconds."
    }
  },

  // === MESSAGES ===
  {
    entity: "message",
    title: "Welcome to Dawn LMS",
    data: {
      thread_id: "thread-welcome",
      sender_id: "system",
      recipient_ids: ["student-001", "student-002"],
      subject: "Welcome to Dawn LMS!",
      body: "Welcome to your new adaptive learning platform. Start your first assignment today!",
      read_by: ["student-001"],
      pinned: false
    }
  },
  {
    entity: "message",
    title: "Assignment Reminder",
    data: {
      thread_id: "thread-reminder-001",
      sender_id: "teacher-001",
      recipient_ids: ["student-003"],
      subject: "Assignment Due Tomorrow",
      body: "Hi! Just a friendly reminder that your Fractions Practice assignment is due tomorrow. Let me know if you need help!",
      read_by: [],
      pinned: false
    }
  }
];

async function seedEntity(record: EntityRecord): Promise<boolean> {
  const endpoint = `${SUPABASE_URL}/functions/v1/save-record`;
  
  try {
    // The save-record endpoint expects { entity, values } where values is the full payload
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Token": AGENT_TOKEN,
        "X-Organization-Id": ORGANIZATION_ID
      },
      body: JSON.stringify({
        entity: record.entity,
        values: {
          title: record.title,
          ...record.data
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  ✗ Failed to seed ${record.entity}/${record.title}: ${response.status} - ${errorText}`);
      return false;
    }

    const result = await response.json();
    console.log(`  ✓ Seeded ${record.entity}: ${record.title} (id: ${result.id})`);
    return true;
  } catch (error) {
    console.error(`  ✗ Error seeding ${record.entity}/${record.title}:`, error);
    return false;
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Dawn LMS Entity Seeder");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Target: ${SUPABASE_URL}`);
  console.log(`  Org ID: ${ORGANIZATION_ID}`);
  console.log(`  Records to seed: ${seedData.length}`);
  console.log("───────────────────────────────────────────────────────────────\n");

  let success = 0;
  let failed = 0;

  for (const record of seedData) {
    const ok = await seedEntity(record);
    if (ok) success++;
    else failed++;
  }

  console.log("\n───────────────────────────────────────────────────────────────");
  console.log(`  Results: ${success} seeded, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main();

