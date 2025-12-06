import { callEdgeFunctionGet } from "./common";

export interface ClassProgressResponse {
  rows: Array<{
    studentId: string;
    name: string;
    attempts: number;
    correct: number;
    accuracy: number;
  }>;
  since: string;
  courseId: string;
  rangeDays: number;
}

/**
 * Get analytics data for teachers
 */
export async function getAnalytics(
  courseId: string | undefined,
  range: "7" | "30" | "90"
): Promise<{
  range: number;
  courseId: string | null;
  dailyData: Array<{
    date: string;
    sessions: number;
    attempts: number;
    accuracy: number;
  }>;
  topStudents: Array<{
    userId: string;
    name: string;
    sessions: number;
    totalScore: number;
    accuracy: number;
  }>;
  summary: {
    totalSessions: number;
    totalAttempts: number;
    overallAccuracy: number;
  };
}> {
  console.info("[getAnalytics]", { courseId, range });

  const params: Record<string, string> = { range };
  if (courseId) {
    params.courseId = courseId;
  }

  const data = await callEdgeFunctionGet<{
    range: number;
    courseId: string | null;
    dailyData: Array<{
      date: string;
      sessions: number;
      attempts: number;
      accuracy: number;
    }>;
    topStudents: Array<{
      userId: string;
      name: string;
      sessions: number;
      totalScore: number;
      accuracy: number;
    }>;
    summary: {
      totalSessions: number;
      totalAttempts: number;
      overallAccuracy: number;
    };
  }>("get-analytics", params);

  console.info("[getAnalytics][ok]");

  return data;
}

/**
 * Fetch analytics data - wrapper that transforms backend data to match UI expectations
 * @param courseId - Course ID to filter analytics
 * @param range - Time range ('7d' | '30d' | '90d')
 * @returns Analytics data with course info, time series, and summary
 */
export async function fetchAnalytics(
  courseId: string,
  range: "7d" | "30d" | "90d" = "7d"
): Promise<{
  course: any;
  analytics: Array<{
    date: string;
    submissions_count: number;
    average_grade?: number;
    time_spent_seconds?: number;
  }>;
  summary: {
    totalStudents: number;
    totalAssignments: number;
    averageGrade: number;
    totalSubmissions: number;
  };
}> {
  const rangeNum = range.replace("d", "") as "7" | "30" | "90";
  const data = await getAnalytics(courseId, rangeNum);

  // Transform dailyData to match expected format
  const analytics = data.dailyData.map((d) => ({
    date: d.date,
    submissions_count: d.attempts,
    average_grade: d.accuracy,
    time_spent_seconds: 0, // Not available in current backend
  }));

  return {
    course: { id: courseId },
    analytics,
    summary: {
      totalStudents: data.topStudents.length,
      totalAssignments: 0, // Not available in current backend
      averageGrade: data.summary.overallAccuracy,
      totalSubmissions: data.summary.totalAttempts,
    },
  };
}

/**
 * Get class progress - per-student accuracy for a course
 */
export async function getClassProgress(
  courseId: string,
  rangeDays: number = 30
): Promise<ClassProgressResponse> {
  console.info("[getClassProgress]", { courseId, rangeDays });

  return callEdgeFunctionGet<ClassProgressResponse>("get-class-progress", {
    courseId,
    rangeDays: rangeDays.toString(),
  });
}
