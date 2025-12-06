/**
 * Fix data-route attributes in all mock HTML files
 * 
 * This script reads each HTML file in docs/mockups/ and updates the
 * data-route attribute to match the expected route based on file path.
 */

import fs from "fs";
import path from "path";

const MOCKUPS_DIR = path.join(process.cwd(), "docs", "mockups");

// Map file paths to routes
const FILE_TO_ROUTE: Record<string, string> = {
  "landing/default.html": "/",
  "auth/default.html": "/auth",
  "auth/reset-password/default.html": "/auth/reset-password",
  "courses/default.html": "/courses",
  "help/default.html": "/help",
  "admin/ai-pipeline/default.html": "/admin/ai-pipeline",
  "admin/courses/select/default.html": "/admin/courses/select",
  "admin/editor/demo-course/default.html": "/admin/editor/demo-course",
  "admin/jobs/default.html": "/admin/jobs",
  "admin/system-health/default.html": "/admin/system-health",
  "admin/courses/demo-course/versions/default.html": "/admin/courses/demo-course/versions",
  "teacher/default.html": "/teacher",
  "teacher/assignments/default.html": "/teacher/assignments",
  "teacher/assignments/demo-assignment/progress/default.html": "/teacher/assignments/demo-assignment/progress",
  "teacher/class-progress/default.html": "/teacher/class-progress",
  "teacher/analytics/default.html": "/teacher/analytics",
  "teacher/classes/default.html": "/teacher/classes",
  "teacher/students/default.html": "/teacher/students",
  "student/dashboard/default.html": "/student/dashboard",
  "student/assignments/default.html": "/student/assignments",
  "student/timeline/default.html": "/student/timeline",
  "student/achievements/default.html": "/student/achievements",
  "student/goals/default.html": "/student/goals",
  "student/join-class/default.html": "/student/join-class",
  "parent/dashboard/default.html": "/parent/dashboard",
  "parent/subjects/default.html": "/parent/subjects",
  "parent/topics/default.html": "/parent/topics",
  "parent/timeline/default.html": "/parent/timeline",
  "parent/goals/default.html": "/parent/goals",
  "parent/link-child/default.html": "/parent/link-child",
  "play/demo-course/welcome/default.html": "/play/demo-course/welcome",
  "play/demo-course/default.html": "/play/demo-course",
  "results/default.html": "/results",
};

function fixDataRoute(filePath: string, expectedRoute: string): boolean {
  const fullPath = path.join(MOCKUPS_DIR, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠️  File not found: ${filePath}`);
    return false;
  }
  
  let content = fs.readFileSync(fullPath, "utf-8");
  
  // Match data-route="..." on body tag
  const bodyRoutePattern = /(<body[^>]*data-route=")([^"]*)(")/;
  const match = content.match(bodyRoutePattern);
  
  if (!match) {
    // No data-route attribute found, try to add it
    const bodyPattern = /<body([^>]*)>/;
    const bodyMatch = content.match(bodyPattern);
    if (bodyMatch) {
      const newBody = `<body${bodyMatch[1]} data-route="${expectedRoute}">`;
      content = content.replace(bodyPattern, newBody);
      fs.writeFileSync(fullPath, content, "utf-8");
      console.log(`✅ Added data-route="${expectedRoute}" to ${filePath}`);
      return true;
    }
    console.warn(`⚠️  No <body> tag found in ${filePath}`);
    return false;
  }
  
  const currentRoute = match[2];
  if (currentRoute === expectedRoute) {
    console.log(`✓  ${filePath} already has correct route`);
    return false;
  }
  
  // Replace the route
  content = content.replace(bodyRoutePattern, `$1${expectedRoute}$3`);
  fs.writeFileSync(fullPath, content, "utf-8");
  console.log(`✅ Fixed ${filePath}: "${currentRoute}" → "${expectedRoute}"`);
  return true;
}

async function main() {
  console.log("🔧 Fixing data-route attributes in mock HTML files...\n");
  
  let fixedCount = 0;
  let errorCount = 0;
  
  for (const [filePath, expectedRoute] of Object.entries(FILE_TO_ROUTE)) {
    try {
      if (fixDataRoute(filePath, expectedRoute)) {
        fixedCount++;
      }
    } catch (err) {
      console.error(`❌ Error fixing ${filePath}:`, err);
      errorCount++;
    }
  }
  
  console.log(`\n✅ Done! Fixed ${fixedCount} files.`);
  if (errorCount > 0) {
    console.log(`⚠️  ${errorCount} errors encountered.`);
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});

