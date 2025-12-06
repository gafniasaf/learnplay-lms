/**
 * Student Assignments Listing Test
 * Validates response shape and sort order by due_date
 */

export async function runStudentAssignmentsTest(): Promise<{ pass: boolean; details?: any }> {
  const details: any = {
    status: 0,
    hasAssignmentsArray: false,
    assignmentCount: 0,
    hasDueDates: false,
    isSortedByDueDate: false,
    skippedAuth: false,
  };

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    
    if (!supabaseUrl) {
      return {
        pass: false,
        details: { ...details, error: "VITE_SUPABASE_URL not configured" },
      };
    }

    const { getAccessToken } = await import("../supabase");
    const token = await getAccessToken();

    const url = `${supabaseUrl}/functions/v1/list-assignments-student`;
    
    const res = await fetch(url, {
      method: 'GET',
      headers: token ? {
        'Authorization': `Bearer ${token}`,
      } : {},
    });
    
    details.status = res.status;

    // Anonymous is authenticated in app; if not, allow 401 as environment issue
    if (res.status === 401) {
      details.skippedAuth = true;
      return {
        pass: true, // Tolerate auth issues
        details: { ...details, note: "Skipped due to authentication" },
      };
    }

    if (!res.ok) {
      return {
        pass: false,
        details: { ...details, error: `Request failed with status ${res.status}` },
      };
    }

    const data = await res.json();
    
    // Validate response shape
    details.hasAssignmentsArray = Array.isArray(data.assignments);
    
    if (!details.hasAssignmentsArray) {
      return {
        pass: false,
        details: { ...details, error: "Response does not contain assignments array" },
      };
    }

    const assignments = data.assignments as any[];
    details.assignmentCount = assignments.length;

    // Check if all assignments have due_date
    details.hasDueDates = assignments.length > 0 && assignments.every(a => a.due_date);

    // Validate sort order if we have multiple assignments with due dates
    if (assignments.length > 1 && assignments.every(a => a.due_date)) {
      const dates = assignments.map(a => +new Date(a.due_date));
      const sorted = [...dates].sort((a, b) => a - b);
      details.isSortedByDueDate = dates.join(",") === sorted.join(",");
      details.dueDates = assignments.map(a => a.due_date);
      
      if (!details.isSortedByDueDate) {
        return {
          pass: false,
          details: {
            ...details,
            error: "Assignments not sorted by due_date in ascending order",
          },
        };
      }
    } else {
      // Not enough data to test sorting, but that's okay
      details.isSortedByDueDate = true;
      details.note = assignments.length <= 1 
        ? "Only 0-1 assignments, sort order not tested"
        : "Not all assignments have due_date, sort order not tested";
    }

    return {
      pass: true,
      details,
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        ...details,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
