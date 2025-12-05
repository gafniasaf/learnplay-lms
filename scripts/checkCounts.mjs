const SUPABASE_URL = 'https://grffepyrmjihphldyfha.supabase.co';
const REST_URL = /rest/v1;
const AUTH_URL = /auth/v1/token?grant_type=password;
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyZmZlcHlybWppaHBobGR5ZmhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NzY4MTYsImV4cCI6MjA3NjI1MjgxNn0.QgMiVaSZERZO7-5-Dul53W8LRtQIv465J29UyySUiek';

async function login(email, password = 'Demo123!') {
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(Failed login for :  );
  }
  return { token: data.access_token, userId: data.user?.id };
}

async function fetchCount(path, token) {
  const res = await fetch(/, {
    headers: {
      apikey: ANON_KEY,
      Authorization: Bearer ,
      Prefer: 'count=exact',
    },
  });

  const range = res.headers.get('content-range');
  const total = range ? range.split('/').pop() : null;
  const body = await res.json();
  return {
    path,
    status: res.status,
    count: total ?? (Array.isArray(body) ? body.length : null),
    body,
  };
}

async function main() {
  try {
    const admin = await login('admin@demo.academy');
    console.log('Admin login ok:', admin.userId);

    const targets = [
      'parent_child_details?select=*&parent_id=eq.e328cc1a-cd82-4acd-b78f-6dada3bca467',
      'profiles?select=id,role',
      'student_assignments?select=*',
      'student_metrics?select=*',
      'student_recommendations?select=*',
      'assignments?select=*',
      'assignment_assignees?select=*',
      'student_goals?select=*',
      'student_activity_log?select=*',
      'student_achievements?select=*',
      'organization_users?select=*',
      'messages?select=*',
    ];

    for (const target of targets) {
      try {
        const result = await fetchCount(target, admin.token);
        console.log(result.path, 'status', result.status, 'count', result.count);
        if (result.status >= 400) {
          console.log('  error body:', JSON.stringify(result.body));
        }
      } catch (err) {
        console.error('Request failed for', target, err);
      }
    }

    console.log('\nParent token access check:');
    try {
      const parent = await login('john.smith@demo.parent');
      const res = await fetch(/parent_child_details?select=*&parent_id=eq.e328cc1a-cd82-4acd-b78f-6dada3bca467, {
        headers: {
          apikey: ANON_KEY,
          Authorization: Bearer ,
          Prefer: 'count=exact',
        },
      });
      const body = await res.json();
      const range = res.headers.get('content-range');
      const total = range ? range.split('/').pop() : null;
      console.log('parent_child_details (parent token) status', res.status, 'count', total, 'body', JSON.stringify(body));
    } catch (err) {
      console.error('Parent token request failed', err);
    }
  } catch (err) {
    console.error('Fatal error', err);
  }
}

await main();
