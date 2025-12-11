import { listCourses } from './listCourses.ts';
import { validateCourse } from './validateCourse.ts';
import { autoFix } from './autoFix.ts';

export async function autoFixBatch({ params }: { params: { orgId?: string; limit?: number; apply?: boolean } }) {
	const coursesRes = await listCourses({ params: { includeArchived: false, limit: 50 } });
	const items: any[] = Array.isArray((coursesRes as any)?.items) ? (coursesRes as any).items : (Array.isArray(coursesRes) ? coursesRes : []);
	const picked = items.slice(0, params.limit || 3);
	const results: any[] = [];

	for (const c of picked) {
		const courseId = String(c?.id || c?.courseId || c);
		let validateOk = false;
		let autoFixOk = false;
		const validationErrors: string[] = [];
		try {
			const v = await validateCourse({ params: { courseId } });
			validateOk = !!(v as any)?.ok;
		} catch (e: any) {
			validationErrors.push(String(e?.message || e));
		}
		try {
			const a = await autoFix({ params: { courseId, apply: params.apply } });
			autoFixOk = !!(a as any)?.ok;
		} catch (_e) {
			autoFixOk = false;
		}
		results.push({ courseId, validateOk, autoFixOk, validationErrors, diffSize: undefined });
	}

	return { ok: results.every(r => r.validateOk), total: results.length, results };
}


