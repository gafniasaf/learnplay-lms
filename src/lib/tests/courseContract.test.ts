/**
 * Course Contract Validator
 * Validates all courses in current mode (live/mock) against defined rules
 * Uses Zod schema for strict Course v2 validation
 */

import { getCourseCatalog, getCourse, getApiMode } from "@/lib/api";
import { CourseSchemaV2 } from "@/lib/schemas/courseV2";
import { z } from "zod";

interface ValidationError {
  courseId: string;
  itemId?: number;
  path?: string;
  rule: string;
  details: string;
}

/**
 * Validate a complete course using Zod schema
 */
function validateCourse(courseData: unknown, courseId: string): ValidationError[] {
  const errors: ValidationError[] = [];

  const result = CourseSchemaV2.safeParse(courseData);
  
  if (!result.success) {
    // Convert Zod errors to ValidationError format
    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      const itemIdMatch = path.match(/items\.(\d+)/);
      const itemId = itemIdMatch ? parseInt(itemIdMatch[1]) : undefined;
      
      errors.push({
        courseId,
        itemId: itemId !== undefined && !isNaN(itemId) ? (courseData as any)?.items?.[itemId]?.id : undefined,
        path,
        rule: issue.code,
        details: issue.message,
      });
    }
  }

  return errors;
}

/**
 * Run course contract validation test
 */
export async function runCourseContractTest(): Promise<{
  pass: boolean;
  details: any;
}> {
  const mode = getApiMode();
  
  try {
    // Fetch course catalog
    const catalog = await getCourseCatalog();
    
    if (!catalog.courses || catalog.courses.length === 0) {
      return {
        pass: false,
        details: {
          error: "No courses found in catalog",
          mode,
        },
      };
    }

    // Validate each course
    const allErrors: ValidationError[] = [];
    const courseResults: Record<string, { items: number; errors: number }> = {};

    for (const courseInfo of catalog.courses) {
      try {
        const course = await getCourse(courseInfo.id);
        const errors = validateCourse(course, courseInfo.id);
        
        allErrors.push(...errors);
        courseResults[courseInfo.id] = {
          items: (course as any)?.items?.length ?? 0,
          errors: errors.length,
        };
      } catch (err) {
        courseResults[courseInfo.id] = {
          items: 0,
          errors: 1,
        };
        allErrors.push({
          courseId: courseInfo.id,
          rule: "course-load",
          details: `Failed to load course: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    const pass = allErrors.length === 0;

    return {
      pass,
      details: {
        mode,
        totalCourses: catalog.courses.length,
        totalErrors: allErrors.length,
        courseResults,
        errors: allErrors.length > 0 ? allErrors.slice(0, 20) : undefined, // Limit to first 20 errors
      },
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        mode,
        error: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}
