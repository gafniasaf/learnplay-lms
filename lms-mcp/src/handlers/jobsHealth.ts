import { deadJobAudit } from './deadJobAudit';

export async function jobsHealth({ params }: { params?: { maxQueuedMin?: number; maxProcessingMin?: number } }) {
	const res = await deadJobAudit({ params: params || {} });
	return {
		ok: !!res.ok,
		counts: res.counts || {},
		stuckJobs: (res.suspects || []).map(s => ({ id: s.id, status: s.status, ageMin: s.ageMin, reason: s.reason })),
		suggestions: res.suggestions || [],
	};
}


