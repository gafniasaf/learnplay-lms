// Test Supabase Management API
const sql = "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'";

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
console.log('Result:', JSON.stringify(data, null, 2));


