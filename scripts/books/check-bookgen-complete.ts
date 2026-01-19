import { createClient } from '@supabase/supabase-js';
import { loadLocalEnvForTests } from '../../tests/helpers/load-local-env';

type JobRow = {
  id: string;
  job_type: string;
  status: string;
  created_at: string;
  payload: unknown;
  error: string | null;
};

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith('--')) return undefined;
  return next;
}

function getArgInt(flag: string): number | undefined {
  const v = getArg(flag);
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function unwrapJobPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};
  const p = payload as Record<string, unknown>;
  const inner = p.payload;
  if (inner && typeof inner === 'object') {
    return { ...p, ...(inner as Record<string, unknown>) };
  }
  return p;
}

function toKey(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

function usage(): never {
  console.error(
    [
      'Usage:',
      '  npx tsx scripts/books/check-bookgen-complete.ts --title "MBO Pathologie nivo 4" --version 55aa87ab --expectedChapters 12 --expectedSections 121',
      '  npx tsx scripts/books/check-bookgen-complete.ts --bookId mbo-pathologie-n4 --version 55aa87ab',
      '',
      'Notes:',
      '- --version accepts either the short version id prefix (book_version_id) or the UUID prefix.',
    ].join('\n'),
  );
  process.exit(1);
}

async function main() {
  loadLocalEnvForTests();

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌ Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const title = getArg('--title');
  const bookIdArg = getArg('--bookId');
  const versionPrefix = getArg('--version') || getArg('--versionPrefix');
  const expectedChapters = getArgInt('--expectedChapters');
  const expectedSections = getArgInt('--expectedSections');

  if (!title && !bookIdArg) usage();

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Resolve book
  let book: { id: string; title: string } | null = null;
  if (bookIdArg) {
    const { data, error } = await supabase.from('books').select('id, title').eq('id', bookIdArg).single();
    if (error) {
      console.error(`❌ Book not found for --bookId ${bookIdArg}: ${error.message}`);
      process.exit(1);
    }
    book = data;
  } else if (title) {
    const { data: exact, error: exactErr } = await supabase
      .from('books')
      .select('id, title')
      .eq('title', title)
      .limit(5);
    if (exactErr) {
      console.error(`❌ Error searching books by title: ${exactErr.message}`);
      process.exit(1);
    }

    const candidates =
      exact && exact.length > 0
        ? exact
        : (
            await supabase
              .from('books')
              .select('id, title')
              .ilike('title', `%${title}%`)
              .limit(10)
          ).data ?? [];

    if (!candidates || candidates.length === 0) {
      console.error(`❌ No books matched title: ${title}`);
      process.exit(1);
    }

    if (candidates.length > 1) {
      console.error(`❌ Multiple books matched "${title}". Re-run with --bookId.`);
      console.table(candidates);
      process.exit(1);
    }

    book = candidates[0];
  }

  if (!book) {
    console.error('❌ Internal error: failed to resolve book');
    process.exit(1);
  }

  // Resolve version
  const { data: versions, error: versionsErr } = await supabase
    .from('book_versions')
    .select('id, book_version_id, book_id, status, exported_at, authoring_mode, skeleton_schema_version')
    .eq('book_id', book.id)
    .order('exported_at', { ascending: false })
    .limit(50);

  if (versionsErr) {
    console.error(`❌ Error fetching versions for book ${book.id}: ${versionsErr.message}`);
    process.exit(1);
  }

  if (!versions || versions.length === 0) {
    console.error(`❌ No versions found for book ${book.id}`);
    process.exit(1);
  }

  const vMatch = (v: any) => {
    if (!versionPrefix) return true;
    const prefix = versionPrefix.toLowerCase();
    const shortId = String(v.book_version_id ?? '').toLowerCase();
    const uuid = String(v.id ?? '').toLowerCase();
    return shortId.startsWith(prefix) || uuid.startsWith(prefix);
  };

  const matchedVersions = versions.filter(vMatch);
  if (matchedVersions.length === 0) {
    console.error(`❌ No versions matched prefix "${versionPrefix}". Available versions:`);
    console.table(
      versions.map(v => ({
        id: v.id,
        book_version_id: v.book_version_id,
        status: v.status,
        exported_at: v.exported_at,
      })),
    );
    process.exit(1);
  }

  const version = matchedVersions[0];

  const needles = [String(version.id), String(version.book_version_id)].filter(Boolean);
  const payloadHasVersion = (payload: unknown): boolean => {
    try {
      const s = JSON.stringify(payload ?? {});
      return needles.some(n => s.includes(n));
    } catch {
      return false;
    }
  };

  // Pull recent jobs for this book and filter to this version in-memory (robust to payload key changes).
  const JOB_TYPES = ['book_generate_section', 'book_generate_chapter'];
  const { data: jobs, error: jobsErr } = await supabase
    .from('ai_agent_jobs')
    .select('id, job_type, status, created_at, payload, error')
    .in('job_type', JOB_TYPES)
    .or(`payload->>bookId.eq.${book.id},payload->payload->>bookId.eq.${book.id}`)
    .order('created_at', { ascending: false })
    .limit(2000);

  if (jobsErr) {
    console.error(`❌ Error fetching jobs for book ${book.id}: ${jobsErr.message}`);
    process.exit(1);
  }

  const jobsForVersion = (jobs as JobRow[] | null | undefined)?.filter(j => payloadHasVersion(j.payload)) ?? [];

  const sections = jobsForVersion.filter(j => j.job_type === 'book_generate_section');
  const chapters = jobsForVersion.filter(j => j.job_type === 'book_generate_chapter');

  const latestSectionByKey = new Map<string, JobRow>();
  for (const j of sections) {
    const p = unwrapJobPayload(j.payload);
    const ch = toKey(p.chapterIndex);
    const sec = toKey(p.sectionIndex);
    const key = ch !== undefined && sec !== undefined ? `ch${ch}.s${sec}` : j.id;
    if (!latestSectionByKey.has(key)) latestSectionByKey.set(key, j);
  }

  const latestChapterByKey = new Map<string, JobRow>();
  for (const j of chapters) {
    const p = unwrapJobPayload(j.payload);
    const ch = toKey(p.chapterIndex);
    const key = ch !== undefined ? `ch${ch}` : j.id;
    if (!latestChapterByKey.has(key)) latestChapterByKey.set(key, j);
  }

  const sectionLatest = [...latestSectionByKey.entries()];
  const chapterLatest = [...latestChapterByKey.entries()];

  const notDoneSections = sectionLatest.filter(([, j]) => j.status !== 'done');
  const notDoneChapters = chapterLatest.filter(([, j]) => j.status !== 'done');

  const sectionStatusCounts: Record<string, number> = {};
  for (const [, j] of sectionLatest) sectionStatusCounts[j.status] = (sectionStatusCounts[j.status] ?? 0) + 1;

  const chapterStatusCounts: Record<string, number> = {};
  for (const [, j] of chapterLatest) chapterStatusCounts[j.status] = (chapterStatusCounts[j.status] ?? 0) + 1;

  const sectionsCountOk = expectedSections ? latestSectionByKey.size === expectedSections : true;
  const chaptersCountOk = expectedChapters ? latestChapterByKey.size === expectedChapters : true;

  const complete = notDoneSections.length === 0 && notDoneChapters.length === 0 && sectionsCountOk && chaptersCountOk;

  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log(`📚 Book:   ${book.title} (${book.id})`);
  console.log(`🏷️  Version: ${version.book_version_id} (${version.id})`);
  console.log(`ℹ️  Version status: ${version.status ?? 'unknown'} | exported_at: ${version.exported_at ?? 'null'}`);
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log(
    `Sections (latest per section): ${latestSectionByKey.size}` +
      (expectedSections ? ` / expected ${expectedSections}` : '') +
      ` | statuses: ${JSON.stringify(sectionStatusCounts)}`,
  );
  console.log(
    `Chapters (latest per chapter): ${latestChapterByKey.size}` +
      (expectedChapters ? ` / expected ${expectedChapters}` : '') +
      ` | statuses: ${JSON.stringify(chapterStatusCounts)}`,
  );
  console.log('────────────────────────────────────────────────────────────────────────────');

  if (complete) {
    console.log('✅ Generation appears COMPLETE for this version (all latest section/chapter jobs are done).');
    return;
  }

  console.log('⚠️ Generation NOT complete (or counts mismatch). Details:');

  if (!sectionsCountOk || notDoneSections.length > 0) {
    console.log(`- Sections: ${notDoneSections.length} latest section(s) not done.`);
    console.table(
      notDoneSections.slice(0, 30).map(([key, j]) => ({
        key,
        status: j.status,
        id: j.id,
        created_at: new Date(j.created_at).toLocaleString(),
        error: (j.error ?? '').slice(0, 120),
      })),
    );
  }

  if (!chaptersCountOk || notDoneChapters.length > 0) {
    console.log(`- Chapters: ${notDoneChapters.length} latest chapter(s) not done.`);
    console.table(
      notDoneChapters.slice(0, 30).map(([key, j]) => ({
        key,
        status: j.status,
        id: j.id,
        created_at: new Date(j.created_at).toLocaleString(),
        error: (j.error ?? '').slice(0, 120),
      })),
    );
  }
}

main().catch(err => {
  console.error('❌ Unhandled error:', err?.message || err);
  process.exit(1);
});

