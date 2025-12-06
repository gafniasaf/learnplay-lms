const SUPABASE_PROJECT_REF = 'eidcegehaswbtzrwzvfa';
const SUPABASE_ACCESS_TOKEN = 'sbp_26da40b93963c303358083b9131f5febe0950f16';

const sql = `
ALTER TABLE public.course_metadata
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS grade_band TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_by UUID NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

CREATE INDEX IF NOT EXISTS idx_course_metadata_archived_at ON public.course_metadata(archived_at);
CREATE INDEX IF NOT EXISTS idx_course_metadata_deleted_at ON public.course_metadata(deleted_at);
`;

fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`
  },
  body: JSON.stringify({ query: sql })
}).then(async r => {
  console.log('Status:', r.status);
  const data = await r.json();
  if (r.status === 201) {
    console.log('✅ Columns added successfully');
  } else {
    console.log('❌ Error:', JSON.stringify(data, null, 2));
  }
}).catch(e => console.log('Error:', e.message));

