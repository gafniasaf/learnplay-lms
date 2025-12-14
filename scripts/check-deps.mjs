// Check for tables needed by parent_child_details view
const tables = ['student_assignments', 'student_goals', 'student_activity_log', 'student_metrics', 'profiles'];
const sql = `
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (${tables.map(t => `'${t}'`).join(', ')})
`;

const response = await fetch('https://api.supabase.com/v1/projects/eidcegehaswbtzrwzvfa/database/query', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sbp_26da40b93963c303358083b9131f5febe0950f16'
  },
  body: JSON.stringify({ query: sql })
});

console.log('Status:', response.status);
const data = await response.json();
const existing = data.map(r => r.table_name);
console.log('Existing:', existing);
console.log('Missing:', tables.filter(t => !existing.includes(t)));


