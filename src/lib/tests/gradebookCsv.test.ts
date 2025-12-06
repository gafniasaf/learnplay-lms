/**
 * Gradebook CSV Headers Test
 * Validates CSV structure without relying on data rows
 */

export async function runGradebookCsvTest(): Promise<{ pass: boolean; details?: any }> {
  const details: any = {
    status: 0,
    contentType: '',
    hasHeaders: false,
    headers: [],
    firstLine: '',
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
    const headers = token ? {
      'Authorization': `Bearer ${token}`,
    } : {};

    // Call with empty assignmentId
    const res = await fetch(`${supabaseUrl}/functions/v1/export-gradebook?assignmentId=`, {
      method: 'GET',
      headers,
    });
    
    details.status = res.status;
    details.contentType = res.headers.get('content-type') || '';

    // If we got a 200, validate CSV headers
    if (res.status === 200) {
      const text = await res.text();
      const lines = text.split(/\r?\n/);
      const firstLine = lines[0] ?? "";
      
      details.firstLine = firstLine;
      
      // Check for expected CSV headers
      const hasStudentName = firstLine.includes("Student Name");
      const hasAttempts = firstLine.includes("Attempts");
      
      details.hasHeaders = hasStudentName && hasAttempts;
      details.headers = firstLine.split(',').map(h => h.trim());
      
      if (!hasStudentName) {
        return {
          pass: false,
          details: {
            ...details,
            error: 'CSV missing "Student Name" header',
          },
        };
      }
      
      if (!hasAttempts) {
        return {
          pass: false,
          details: {
            ...details,
            error: 'CSV missing "Attempts" header',
          },
        };
      }
      
      return {
        pass: true,
        details,
      };
    }
    
    // If not 200, accept 400 or 401 as valid responses
    if ([400, 401].includes(res.status)) {
      return {
        pass: true,
        details: {
          ...details,
          note: `Correctly rejected request with empty assignmentId (${res.status})`,
        },
      };
    }
    
    // Unexpected status code
    return {
      pass: false,
      details: {
        ...details,
        error: `Unexpected status code: ${res.status}`,
      },
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
