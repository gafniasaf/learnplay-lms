// Apply a single migration file via Supabase Management API
import * as fs from 'fs';
import * as path from 'path';

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.log('Usage: node scripts/apply-migration.mjs <migration-file.sql>');
  process.exit(1);
}

const migrationPath = migrationFile.includes('/') || migrationFile.includes('\\')
  ? migrationFile
  : path.join('supabase/migrations', migrationFile);

if (!fs.existsSync(migrationPath)) {
  console.error(`File not found: ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf-8');
console.log(`Applying: ${path.basename(migrationPath)} (${sql.length} chars)`);

const response = await fetch('https://api.supabase.com/v1/projects/eidcegehaswbtzrwzvfa/database/query', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sbp_26da40b93963c303358083b9131f5febe0950f16'
  },
  body: JSON.stringify({ query: sql })
});

console.log('Status:', response.status);
const text = await response.text();
try {
  const data = JSON.parse(text);
  if (response.status >= 400) {
    console.error('❌ Error:', JSON.stringify(data, null, 2));
    process.exit(1);
  }
  console.log('✅ Migration applied successfully');
  if (Array.isArray(data) && data.length > 0) {
    console.log('Result:', JSON.stringify(data, null, 2));
  }
} catch {
  console.log('Response:', text.slice(0, 500));
  if (response.status >= 400) process.exit(1);
}

