// Check if update_updated_at_column function exists
const sql = "SELECT proname FROM pg_proc WHERE proname = 'update_updated_at_column'";

const response = await fetch('https://api.supabase.com/v1/projects/eidcegehaswbtzrwzvfa/database/query', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sbp_26da40b93963c303358083b9131f5febe0950f16'
  },
  body: JSON.stringify({ query: sql })
});

const data = await response.json();
if (data.length > 0) {
  console.log('✅ update_updated_at_column function exists');
} else {
  console.log('❌ update_updated_at_column function MISSING - need to create it first');
}


