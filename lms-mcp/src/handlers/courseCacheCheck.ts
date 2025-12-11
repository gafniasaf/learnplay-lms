import { config } from '../config.ts';

export async function courseCacheCheck({ params }: { params: { courseId: string } }) {
	const url = `${config.supabaseUrl}/functions/v1/get-course?courseId=${encodeURIComponent(params.courseId)}`;
	const r1 = await fetch(url, { method: 'GET' });
	const etag = r1.headers.get('etag') || r1.headers.get('ETag') || undefined;
	const cacheControl = r1.headers.get('cache-control') || undefined;
	// second request with If-None-Match
	let got304 = false;
	if (etag) {
		const r2 = await fetch(url, { method: 'GET', headers: { 'If-None-Match': etag } });
		got304 = r2.status === 304;
	}
	return { ok: !!etag && got304, etag, got304, cacheControl };
}


