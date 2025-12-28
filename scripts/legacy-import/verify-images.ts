/**
 * Verify migrated images in imported legacy course
 */

import { loadLearnPlayEnv } from '../../tests/helpers/parse-learnplay-env';
import { loadLocalEnvForTests } from '../../tests/helpers/load-local-env';

loadLocalEnvForTests();
loadLearnPlayEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const AGENT_TOKEN = process.env.AGENT_TOKEN;
const ORG = process.env.ORGANIZATION_ID || process.env.VITE_ORGANIZATION_ID;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !AGENT_TOKEN || !ORG) {
  throw new Error('missing env');
}

const courseId = process.argv[2] || 'legacy-4';

async function main() {
  const url = `${SUPABASE_URL}/functions/v1/get-course?courseId=${encodeURIComponent(courseId)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${String(SUPABASE_ANON_KEY)}`,
      apikey: String(SUPABASE_ANON_KEY),
      'x-agent-token': String(AGENT_TOKEN),
      'x-organization-id': String(ORG),
    },
  });

  const json = await res.json();
  const course =
    json && typeof json === 'object' && 'content' in json && 'format' in json
      ? (json as any).content
      : json;

  const sts = Array.isArray((course as any).studyTexts) ? (course as any).studyTexts : [];
  const items = Array.isArray((course as any).items) ? (course as any).items : [];
  
  const stJoined = sts.map((s: any) => String(s?.content || '')).join('\n');
  const itemsJoined = JSON.stringify(items);

  const stMarkerCount = (stJoined.match(/\[IMAGE:/g) || []).length;
  const stMarkerTexts = sts.filter((s: any) => String(s?.content || '').includes('[IMAGE:')).length;
  const stMediaLibraryUrls = (stJoined.match(/\/storage\/v1\/object\/public\/media-library\/[^\s\)]+/g) || []).length;

  // Check items for images
  const itemImages = items.filter((item: any) => {
    const stem = String(item?.stem?.html || '');
    const options = Array.isArray(item?.options) ? item.options : [];
    const optionImages = options.some((opt: any) => opt?.image || opt?.media?.image);
    return stem.includes('[IMAGE:') || stem.includes('/storage/v1/object/public/media-library/') || optionImages;
  }).length;

  const allContent = stJoined + '\n' + itemsJoined;
  const totalMediaLibraryUrls = (allContent.match(/\/storage\/v1\/object\/public\/media-library\/[^\s\)]+/g) || []).length;

  // Check course metadata for image
  const courseImage = (course as any).image || (course as any).thumbnail;
  const courseImageIsMediaLibrary = courseImage && String(courseImage).includes('/storage/v1/object/public/media-library/');

  console.log(
    JSON.stringify(
      {
        courseId,
        courseImage: courseImage ? String(courseImage).substring(0, 100) : null,
        courseImageIsMediaLibrary,
        studyTexts: sts.length,
        items: items.length,
        studyTextsWithImageMarkers: stMarkerTexts,
        studyTextImageMarkerCount: stMarkerCount,
        studyTextMediaLibraryUrls: stMediaLibraryUrls,
        itemsWithImages: itemImages,
        totalMediaLibraryUrls,
        containsLegacy: allContent.includes('expertcollegeresources.blob.core.windows.net'),
        containsMediaLibrary: allContent.includes('/storage/v1/object/public/media-library/'),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});

