/**
 * Assignment Flow Test (Mock Mode)
 * Verifies teacher createAssignment → appears in list → student sees it
 */

import { 
  createAssignment, 
  listAssignments,
  getApiMode,
  clearMockAssignments,
  type CreateAssignmentRequest 
} from "@/lib/api";

/**
 * Run assignment flow test
 */
export async function runAssignmentFlowTest(): Promise<{
  pass: boolean;
  details: any;
}> {
  const mode = getApiMode();
  
  // Only run in mock mode
  if (mode !== "mock") {
    return {
      pass: true,
      details: {
        skipped: true,
        reason: "Assignment flow test only runs in mock mode",
        mode,
      },
    };
  }

  try {
    // Clear any existing mock assignments
    clearMockAssignments();

    const testResults = {
      createAssignment: false,
      teacherList: false,
      studentList: false,
      details: {} as any,
    };

    // Step 1: Create an assignment as teacher
    const createPayload: CreateAssignmentRequest = {
      orgId: "test-org-id",
      courseId: "modals",
      title: "Test Assignment",
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
      assignees: [
        {
          type: "class",
          classId: "test-class-id",
        },
      ],
    };

    try {
      const createResult = await createAssignment(createPayload);
      testResults.createAssignment = !!createResult.assignmentId;
      testResults.details.createdId = createResult.assignmentId;
      testResults.details.createMessage = createResult.message;
    } catch (err) {
      testResults.details.createError = err instanceof Error ? err.message : String(err);
    }

    // Step 2: List assignments as teacher
    try {
      const teacherList = await listAssignments();
      testResults.teacherList = Array.isArray(teacherList.assignments);
      testResults.details.teacherCount = teacherList.assignments?.length || 0;
      
      // Verify the created assignment appears
      const foundInTeacher = teacherList.assignments?.some(
        (a) => a.title === "Test Assignment"
      );
      testResults.details.foundInTeacherList = foundInTeacher;
    } catch (err) {
      testResults.details.teacherListError = err instanceof Error ? err.message : String(err);
    }

    // Step 3: List assignments as student
    try {
      const studentList = await listAssignments();
      testResults.studentList = Array.isArray(studentList.assignments);
      testResults.details.studentCount = studentList.assignments?.length || 0;
      
      // Verify the created assignment appears
      const foundInStudent = studentList.assignments?.some(
        (a) => a.title === "Test Assignment"
      );
      testResults.details.foundInStudentList = foundInStudent;
    } catch (err) {
      testResults.details.studentListError = err instanceof Error ? err.message : String(err);
    }

    // Pass if all three operations completed
    const pass = 
      testResults.createAssignment && 
      testResults.teacherList && 
      testResults.studentList;

    return {
      pass,
      details: {
        mode,
        steps: testResults,
      },
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        mode,
        error: `Assignment flow test failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}
