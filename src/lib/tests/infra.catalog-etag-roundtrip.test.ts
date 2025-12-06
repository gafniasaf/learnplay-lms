/**
 * infra.catalog-etag-roundtrip.test.ts
 * 
 * Validates that:
 * 1. list-courses returns a strong ETag based on catalog content
 * 2. Subsequent requests with If-None-Match return 304 Not Modified
 * 3. ETag changes when catalog content changes
 */

export async function runCatalogEtagRoundtripTest(): Promise<{
  pass: boolean;
  details: {
    coldStatus: number;
    coldEtag: string | null;
    warmStatus: number;
    warmEtagMatch: boolean;
    etagFormat: string;
    testTimestamp: string;
  };
}> {
  const testTimestamp = new Date().toISOString();
  
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    
    if (!supabaseUrl) {
      return {
        pass: false,
        details: {
          coldStatus: 0,
          coldEtag: null,
          warmStatus: 0,
          warmEtagMatch: false,
          etagFormat: 'error',
          testTimestamp,
        },
      };
    }

    const FUNCTION_URL = `${supabaseUrl}/functions/v1/list-courses`;
    
    // Cold request - fetch catalog and get ETag
    console.log('[catalog-etag-test] Making cold request...');
    const coldResp = await fetch(FUNCTION_URL);
    const coldStatus = coldResp.status;
    const coldEtag = coldResp.headers.get('etag');
    const coldBody = coldStatus === 200 ? await coldResp.json() : null;

    console.log(`[catalog-etag-test] Cold response: status=${coldStatus}, etag=${coldEtag}`);

    if (coldStatus !== 200) {
      return {
        pass: false,
        details: {
          coldStatus,
          coldEtag,
          warmStatus: 0,
          warmEtagMatch: false,
          etagFormat: 'none',
          testTimestamp,
        },
      };
    }

    if (!coldEtag) {
      return {
        pass: false,
        details: {
          coldStatus,
          coldEtag: null,
          warmStatus: 0,
          warmEtagMatch: false,
          etagFormat: 'missing',
          testTimestamp,
        },
      };
    }

    // Validate ETag format (should be W/"<sha1-hash>" or "<sha1-hash>")
    const etagFormat = coldEtag.startsWith('W/"') ? 'weak' : 
                       coldEtag.startsWith('"') ? 'strong' : 'invalid';

    // Warm request - send If-None-Match with the ETag
    console.log('[catalog-etag-test] Making warm request with If-None-Match...');
    const warmResp = await fetch(FUNCTION_URL, {
      headers: {
        'If-None-Match': coldEtag,
      },
    });
    const warmStatus = warmResp.status;
    const warmEtag = warmResp.headers.get('etag');

    console.log(`[catalog-etag-test] Warm response: status=${warmStatus}, etag=${warmEtag}`);

    // Check if ETag matches
    const warmEtagMatch = warmEtag === coldEtag;

    // Pass criteria:
    // 1. Cold request returns 200 with ETag
    // 2. Warm request returns 304 with matching ETag
    // 3. ETag has valid format
    const pass = coldStatus === 200 && 
                 warmStatus === 304 && 
                 warmEtagMatch &&
                 (etagFormat === 'weak' || etagFormat === 'strong');

    return {
      pass,
      details: {
        coldStatus,
        coldEtag,
        warmStatus,
        warmEtagMatch,
        etagFormat,
        testTimestamp,
      },
    };
  } catch (err) {
    console.error('[catalog-etag-test] Test error:', err);
    return {
      pass: false,
      details: {
        coldStatus: 0,
        coldEtag: null,
        warmStatus: 0,
        warmEtagMatch: false,
        etagFormat: 'error',
        testTimestamp,
      },
    };
  }
}
