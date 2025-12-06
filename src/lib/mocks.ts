import type { Course } from "./types/course";
import type { CourseCatalog } from "./types/courseCatalog";
import type { Dashboard, DashboardRole } from "./types/dashboard";
import { parseMedJson, fetchAndParseCourse } from "./adapters/courseAdapter";

/**
 * Simulates network delay for more realistic mock API behavior
 */
const simulateDelay = (ms: number = 300): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Fetches course data by course ID from mock JSON files
 * @param courseId - The unique identifier for the course
 * @returns Promise resolving to Course data
 * @throws Error if course not found or fetch fails
 */
export async function fetchCourse(courseId: string): Promise<Course> {
  await simulateDelay();

  try {
    // Use the adapter to fetch and parse the course
    const course = await fetchAndParseCourse(courseId);
    
    // Validate required fields
    if (!course.id || !course.title || !course.items || !course.groups || !course.levels) {
      throw new Error(`Invalid course data structure for '${courseId}'`);
    }

    return course;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to fetch course '${courseId}'`);
  }
}

/**
 * Fetches dashboard data for a specific role
 * @param role - The user role (student, teacher, parent, school)
 * @returns Promise resolving to Dashboard data
 * @throws Error if role is invalid or fetch fails
 */
export async function fetchDashboard(role: DashboardRole): Promise<Dashboard> {
  await simulateDelay();

  const validRoles: DashboardRole[] = ["student", "teacher", "parent", "school"];
  
  if (!validRoles.includes(role)) {
    throw new Error(`Invalid role '${role}'. Must be one of: ${validRoles.join(", ")}`);
  }

  try {
    const response = await fetch(`/mock/dashboard-${role}.json`);
    
    if (!response.ok) {
      throw new Error(`Dashboard for role '${role}' not found (${response.status})`);
    }

    const data: Dashboard = await response.json();
    
    // Validate role matches
    if (data.role !== role) {
      throw new Error(`Dashboard role mismatch: expected '${role}', got '${data.role}'`);
    }

    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to fetch dashboard for role '${role}'`);
  }
}

/**
 * Gets all available course IDs (for development/testing)
 * In production, this would query a course catalog API
 */
export function getAvailableCourses(): string[] {
  return ["modals", "verbs", "history", "multiplication", "science"];
}

/**
 * Fetches course catalog with metadata for all available courses
 * @returns Promise resolving to CourseCatalog
 */
export async function fetchCourseCatalog(): Promise<CourseCatalog> {
  await simulateDelay();

  return {
    courses: [
      {
        id: "modals",
        title: "English Modals",
        subject: "English Grammar",
        gradeBand: "Middle School",
        contentVersion: "1.0.0",
        description: "Learn English modal verbs through interactive exercises.",
        itemCount: 48,
        duration: "15 min",
        difficulty: "Intermediate",
      },
      {
        id: "verbs",
        title: "English Verbs",
        subject: "English Grammar",
        gradeBand: "Middle School",
        contentVersion: "1.0.0",
        description: "Master English verb tenses with hands-on practice.",
        itemCount: 48,
        duration: "15 min",
        difficulty: "Intermediate",
      },
    ],
  };
}

/**
 * Gets available dashboard roles (for development/testing)
 */
export function getAvailableRoles(): DashboardRole[] {
  return ["student", "teacher", "parent", "school", "admin"];
}
