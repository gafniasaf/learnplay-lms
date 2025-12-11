import { getCourse } from './getCourse.ts';
import { enqueueAndTrack } from './enqueueAndTrack.ts';
import { applyJobResult } from './applyJobResult.ts';

export async function prPreviewSmoke({ params }: { params: { courseId?: string; type?: 'variants' | 'localize' } }) {
	const courseId = params.courseId || process.env.PR_SMOKE_COURSE_ID || '';
	if (!courseId) {
		return { ok: true }; // skip if not configured
	}
	// 1) getCourse
	await getCourse({ params: { courseId } });
	// 2) enqueueAndTrack
	const eq = await enqueueAndTrack({ params: { type: params.type || 'variants', subject: `pr-smoke-${Date.now()}`, courseId, timeoutSec: 60 } });
	// 3) applyJobResult dry-run
	if (eq?.jobId) {
		await applyJobResult({ params: { jobId: eq.jobId, courseId, dryRun: true } });
	}
	return { ok: true, jobId: eq?.jobId, status: eq?.status, applied: !!eq?.jobId };
}


