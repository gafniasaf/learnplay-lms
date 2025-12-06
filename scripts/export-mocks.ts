import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";

type RouteConfig = {
  path: string;
  name: string;
  description?: string;
};

type CTA = {
  id: string;
  action?: string;
  target?: string;
  jobType?: string;
};

const BASE_URL = process.env.MOCK_BASE_URL || "http://localhost:8081";
const OUTPUT_DIR = path.join(process.cwd(), "docs", "mockups");

// Inventory of all app routes (expanded for dynamic params)
const routes: RouteConfig[] = [
  // Core / auth / help
  { path: "/", name: "Home" },
  { path: "/auth", name: "Auth" },
  { path: "/auth/reset-password", name: "Reset Password" },
  { path: "/courses", name: "Courses" },
  { path: "/help", name: "Help" },

  // Admin core
  { path: "/admin/ai-pipeline", name: "AI Pipeline" },
  { path: "/admin/courses/select", name: "Course Selector" },
  { path: "/admin/editor/demo-course", name: "Course Editor" },
  { path: "/admin/jobs", name: "Jobs Dashboard" },
  { path: "/admin/system-health", name: "System Health" },
  { path: "/admin/courses/demo-course/versions", name: "Course Version History" },

  // Teacher
  { path: "/teacher", name: "Teacher Dashboard" },
  { path: "/teacher/assignments", name: "Teacher Assignments" },
  { path: "/teacher/assignments/demo-assignment/progress", name: "Assignment Progress" },
  { path: "/teacher/class-progress", name: "Class Progress" },
  { path: "/teacher/analytics", name: "Analytics" },
  { path: "/teacher/classes", name: "Classes" },
  { path: "/teacher/students", name: "Students" },

  // Student
  { path: "/student/dashboard", name: "Student Dashboard" },
  { path: "/student/assignments", name: "Student Assignments" },
  { path: "/student/timeline", name: "Student Timeline" },
  { path: "/student/achievements", name: "Student Achievements" },
  { path: "/student/goals", name: "Student Goals" },
  { path: "/student/join-class", name: "Join Class" },

  // Parent
  { path: "/parent/dashboard", name: "Parent Dashboard" },
  { path: "/parent/subjects", name: "Parent Subjects" },
  { path: "/parent/topics", name: "Parent Topics" },
  { path: "/parent/timeline", name: "Parent Timeline" },
  { path: "/parent/goals", name: "Parent Goals" },
  { path: "/parent/link-child", name: "Link Child" },

  // Play
  { path: "/play/demo-course/welcome", name: "Play Welcome" },
  { path: "/play/demo-course", name: "Play Session" },
  { path: "/results", name: "Results" },
];

function toFilePath(routePath: string): string {
  if (routePath === "/") return path.join("landing", "default.html");
  const segments = routePath.replace(/^\//, "").split("/");
  return path.join(...segments, "default.html");
}

function ensureDirExists(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function exportRoute(page, route: RouteConfig) {
  const url = `${BASE_URL}${route.path}`;
  console.log(`→ Exporting ${route.path}`);

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  // Stamp data-route for validation (use route.path directly since SPA routing may not update window.location)
  await page.evaluate((routePath) => {
    document.body.setAttribute("data-route", routePath);
  }, route.path);

  // Collect CTAs
  const ctas: CTA[] = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-cta-id]"))
      .map((el) => ({
        id: el.getAttribute("data-cta-id") || "",
        action: el.getAttribute("data-action") || undefined,
        target:
          el.getAttribute("data-target") ||
          el.getAttribute("href") ||
          undefined,
        jobType: el.getAttribute("data-job-type") || undefined,
      }))
      .filter((cta) => cta.id)
  );

  const html = await page.content();
  const filePath = path.join(OUTPUT_DIR, toFilePath(route.path));
  ensureDirExists(filePath);
  fs.writeFileSync(filePath, html, "utf-8");

  return { filePath, ctas };
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Force mock mode for determinism where possible
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("useMock", "true");
    } catch {
      // ignore
    }
  });

  const coverageRoutes: {
    path: string;
    name: string;
    description: string;
    states: { id: string; file: string; description: string; required: boolean }[];
    requiredCTAs: CTA[];
  }[] = [];

  for (const route of routes) {
    const result = await exportRoute(page, route);
    const relativeFile = path.relative(OUTPUT_DIR, result.filePath).replace(/\\/g, "/");

    // Deduplicate CTAs by id
    const seen = new Set<string>();
    const dedupedCTAs = result.ctas.filter((cta) => {
      if (seen.has(cta.id)) return false;
      seen.add(cta.id);
      return true;
    });

    coverageRoutes.push({
      path: route.path,
      name: route.name,
      description: route.description || route.name,
      states: [
        {
          id: "default",
          file: relativeFile,
          description: "Default state",
          required: true,
        },
      ],
      requiredCTAs: dedupedCTAs,
    });
  }

  await browser.close();

  const coverage = {
    routes: coverageRoutes,
    sharedComponents: [],
    validationRules: {
      everyRouteMustHaveDefaultState: true,
      everyStateMustHaveFile: true,
      everyFileMustHaveDataRoute: true,
      everyRequiredCTAMustExist: true,
      sharedComponentsMustBeConsistent: false,
    },
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "coverage.json"),
    JSON.stringify(coverage, null, 2),
    "utf-8"
  );

  console.log("\n✅ Export complete. Coverage written to docs/mockups/coverage.json");
}

main().catch((err) => {
  console.error("Export failed", err);
  process.exit(1);
});

