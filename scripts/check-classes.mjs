// Check classes table structure
const sql = "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'classes' ORDER BY ordinal_position";

const response = await fetch('https://api.supabase.com/v1/projects/eidcegehaswbtzrwzvfa/database/query', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sbp_26da40b93963c303358083b9131f5febe0950f16'
  },
  body: JSON.stringify({ query: sql })
});

const data = await response.json();
console.log('Classes table columns:');
data.forEach(col => console.log(` - ${col.column_name}: ${col.data_type}`));

