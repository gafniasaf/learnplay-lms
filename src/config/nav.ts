/**
 * Unified Navigation Configuration
 * Single source of truth for all app navigation
 */

// LucideIcon import removed - type is inferred

export type UserRole = "student" | "teacher" | "parent" | "school" | "admin";

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon?: string; // Icon name from lucide-react
  roles?: UserRole[];
  devOnly?: boolean;
  external?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * All navigation sections and items
 */
export const navSections: NavSection[] = [
  {
    title: "Books",
    items: [
      // WYSIWYG Book Studio (admin)
      { id: "book-studio", label: "Book Studio", path: "/admin/book-studio", icon: "BookOpen", roles: ["admin"] },
      { id: "book-studio-generate", label: "Generate Full Book", path: "/admin/book-studio/generate", icon: "Sparkles", roles: ["admin"] },
      {
        id: "book-missing-images",
        label: "Book missing images",
        path: "/admin/books/missing-images",
        icon: "Image",
        roles: ["admin"],
      },
    ],
  },
  {
    title: "Courses",
    items: [
      // Public course browsing
      { id: "courses", label: "Courses", path: "/courses", icon: "BookOpen" },

      // Admin course pipeline/tools
      { id: "ai-pipeline", label: "AI Pipeline", path: "/admin/ai-pipeline", icon: "Sparkles", roles: ["admin"] },
      { id: "course-editor", label: "Course Editor", path: "/admin/courses/select", icon: "Edit", roles: ["admin"] },
      { id: "library-courses", label: "Library Courses", path: "/admin/library-courses", icon: "Library", roles: ["admin"] },

      // Teacher pages
      { id: "teacher", label: "Dashboard", path: "/teacher", icon: "BarChart", roles: ["teacher"] },
      { id: "students", label: "Students", path: "/teacher/students", icon: "Users", roles: ["teacher"] },
      { id: "classes", label: "Classes", path: "/teacher/classes", icon: "GraduationCap", roles: ["teacher"] },
      { id: "class-progress", label: "Class Progress", path: "/teacher/class-progress", icon: "Activity", roles: ["teacher"] },
      { id: "assignments", label: "Assignments", path: "/teacher/assignments", icon: "ClipboardList", roles: ["teacher"] },
      { id: "assignment-progress", label: "Assignment Progress", path: "/teacher/assignments/:id/progress", icon: "Award", roles: ["teacher"] },
      { id: "analytics", label: "Analytics", path: "/teacher/analytics", icon: "BarChart", roles: ["teacher"] },

      // Parent pages
      { id: "parent-overview", label: "Parent Overview", path: "/parent/dashboard", icon: "LayoutDashboard", roles: ["parent"] },
      { id: "parent-subjects", label: "Parent Subjects", path: "/parent/subjects", icon: "BookOpen", roles: ["parent"] },
      { id: "parent-topics", label: "Parent Topics", path: "/parent/topics", icon: "ListChecks", roles: ["parent"] },
      { id: "parent-timeline", label: "Parent Timeline", path: "/parent/timeline", icon: "Clock", roles: ["parent"] },
      { id: "parent-goals", label: "Parent Goals & Alerts", path: "/parent/goals", icon: "Target", roles: ["parent"] },
      { id: "link-child", label: "Link Child", path: "/parent/link-child", icon: "Link2", roles: ["parent"] },

      // Student pages
      { id: "student-assignments", label: "Student Assignments", path: "/student/assignments", icon: "ClipboardList", roles: ["student"] },
      { id: "join-class", label: "Join Class", path: "/student/join-class", icon: "UserPlus", roles: ["student"] },
    ],
  },
  {
    title: "TeacherGPT",
    items: [
      { id: "lesson-kits", label: "Lesson Kits", path: "/teacher/lesson-kits", icon: "WandSparkles", roles: ["teacher", "admin"] },
      { id: "materials", label: "Materials", path: "/teacher/materials", icon: "FileText", roles: ["teacher", "admin"] },
      { id: "standards", label: "Standards", path: "/teacher/standards", icon: "ScrollText", roles: ["teacher", "admin"] },
      { id: "teachergpt-chat", label: "Chat", path: "/teacher/teachergpt/chat", icon: "MessageSquare", roles: ["teacher", "admin"] },
      { id: "teachergpt-mes", label: "MES Recommendations", path: "/teacher/teachergpt/mes", icon: "Search", roles: ["teacher", "admin"] },
    ],
  },
  {
    title: "System",
    items: [
      { id: "home", label: "Home", path: "/", icon: "Home" },

      // Admin/system tools
      {
        id: "wysiwyg-exercise-editor",
        label: "Wysiwyg exercise editor",
        path: "/admin/wysiwyg-exercise-editor/select",
        icon: "Edit",
        roles: ["admin"],
      },
      {
        id: "expertcollege-exercise-generation-editor",
        label: "Expertcollege exercise generation editor",
        path: "/admin/expertcollege-exercise-generation/select",
        icon: "Sparkles",
        roles: ["admin"],
      },
      { id: "logs", label: "System Logs", path: "/admin/logs", icon: "ScrollText", roles: ["admin"] },
      { id: "tag-management", label: "Tag Management", path: "/admin/tags", icon: "Tags", roles: ["admin"] },
      { id: "tag-approval", label: "Tag Approval Queue", path: "/admin/tags/approve", icon: "CheckSquare", roles: ["admin"] },
      { id: "media-manager", label: "Media Manager", path: "/admin/tools/media", icon: "FolderOpen", roles: ["admin"] },
      { id: "jobs-dashboard", label: "Job Queue", path: "/admin/jobs", icon: "ListChecks", roles: ["admin"] },
      { id: "performance", label: "Performance", path: "/admin/performance", icon: "Activity", roles: ["admin"] },
      { id: "system-health", label: "System Health", path: "/admin/system-health", icon: "Activity", roles: ["admin"] },
    ],
  },
];

/**
 * Filter navigation items based on user role and dev mode
 * Filters out items that don't match role or dev requirements
 */
export function filterNav(options: {
  role?: UserRole;
  devEnabled?: boolean;
}): NavSection[] {
  const { role, devEnabled = false } = options;

  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        // Filter out dev-only items if dev mode not enabled
        if (item.devOnly && !devEnabled) {
          return false;
        }

        // If item has role restrictions, check if current role matches
        if (item.roles && item.roles.length > 0) {
          // If no role provided, hide restricted items
          if (!role) {
            return false;
          }
          // Check if current role is in the allowed roles
          if (!item.roles.includes(role)) {
            return false;
          }
        }

        return true;
      }),
    }))
    .filter((section) => section.items.length > 0); // Remove empty sections
}

/**
 * Get all nav items as flat list
 */
export function getAllNavItems(): NavItem[] {
  return navSections.flatMap((section) => section.items);
}

/**
 * Find nav item by ID
 */
export function getNavItem(id: string): NavItem | undefined {
  return getAllNavItems().find((item) => item.id === id);
}

/**
 * Find nav item by path
 */
export function getNavItemByPath(path: string): NavItem | undefined {
  return getAllNavItems().find((item) => item.path === path);
}
