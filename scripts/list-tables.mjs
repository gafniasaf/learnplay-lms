// List all public tables
const sql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name";

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
console.log('Tables in public schema:');
data.forEach(row => console.log(' -', row.table_name));
console.log(`\nTotal: ${data.length} tables`);


