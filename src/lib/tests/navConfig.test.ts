/**
 * Navigation Configuration Tests
 * Tests the unified nav config filtering logic
 */

import { filterNav, navSections, getAllNavItems } from "@/config/nav";

/**
 * Test nav filtering with different roles and dev settings
 */
export async function runNavConfigTests(): Promise<{
  pass: boolean;
  details: any;
}> {
  try {
    const totalItems = getAllNavItems().length;

    // Test 1: No role, dev disabled - should only see public items
    const publicNav = filterNav({ devEnabled: false });
    const publicItems = publicNav.flatMap((s) => s.items);
    const hasDevItems = publicItems.some((item) => item.devOnly);
    const hasRoleItems = publicItems.some(
      (item) => item.roles && item.roles.length > 0
    );

    const test1Pass = !hasDevItems && !hasRoleItems;

    // Test 2: Teacher role, dev disabled - should see teacher items
    const teacherNav = filterNav({ role: "teacher", devEnabled: false });
    const teacherItems = teacherNav.flatMap((s) => s.items);
    const hasTeacherDashboard = teacherItems.some(
      (item) => item.id === "teacher"
    );
    const hasAdminPipeline = teacherItems.some((item) => item.id === "ai-pipeline");
    const teacherHasDevItems = teacherItems.some((item) => item.devOnly);

    const test2Pass =
      hasTeacherDashboard && !hasAdminPipeline && !teacherHasDevItems;

    // Test 3: Admin role, dev disabled - should see admin items
    const adminNav = filterNav({ role: "admin", devEnabled: false });
    const adminItems = adminNav.flatMap((s) => s.items);
    const hasAdminItems = adminItems.some((item) => item.id === "ai-pipeline");
    const adminHasDevItems = adminItems.some((item) => item.devOnly);

    const test3Pass = hasAdminItems && !adminHasDevItems;

    // Test 4: Dev enabled - should still respect role gates when role is not provided
    const devNav = filterNav({ devEnabled: true });
    const devItems = devNav.flatMap((s) => s.items);
    const devHasRoleItems = devItems.some((item) => item.roles && item.roles.length > 0);
    const test4Pass = !devHasRoleItems;

    // Test 5: Student role - should see student items
    const studentNav = filterNav({ role: "student", devEnabled: false });
    const studentItems = studentNav.flatMap((s) => s.items);
    const hasStudentAssignments = studentItems.some((item) => item.id === "student-assignments");
    const studentHasTeacher = studentItems.some((item) => item.id === "teacher");

    const test5Pass = hasStudentAssignments && !studentHasTeacher;

    // Test 6: Empty sections should be filtered out
    const allSections = filterNav({ role: "teacher", devEnabled: false });
    const allHaveItems = allSections.every((section) => section.items.length > 0);

    const test6Pass = allHaveItems;

    const allPass =
      test1Pass &&
      test2Pass &&
      test3Pass &&
      test4Pass &&
      test5Pass &&
      test6Pass;

    return {
      pass: allPass,
      details: {
        totalItems,
        totalSections: navSections.length,
        tests: {
          publicAccess: {
            pass: test1Pass,
            itemCount: publicItems.length,
            hasDevItems,
            hasRoleItems,
          },
          teacherRole: {
            pass: test2Pass,
            itemCount: teacherItems.length,
            hasTeacherDashboard,
            hasAdminDashboard,
            hasDevItems: teacherHasDevItems,
          },
          adminRole: {
            pass: test3Pass,
            itemCount: adminItems.length,
            hasAdminItems,
            hasDevItems: adminHasDevItems,
          },
          devEnabled: {
            pass: test4Pass,
            itemCount: devItems.length,
            devHasRoleItems,
          },
          studentRole: {
            pass: test5Pass,
            itemCount: studentItems.length,
            hasStudentAssignments,
            hasTeacher: studentHasTeacher,
          },
          emptySectionsFiltered: {
            pass: test6Pass,
            allHaveItems,
          },
        },
        summary: {
          total: 6,
          passed: [
            test1Pass,
            test2Pass,
            test3Pass,
            test4Pass,
            test5Pass,
            test6Pass,
          ].filter(Boolean).length,
        },
      },
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        error: `Nav config test failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    };
  }
}
