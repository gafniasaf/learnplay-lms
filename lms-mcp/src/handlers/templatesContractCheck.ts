import { listTemplates, getTemplate } from './templates.js';

const REQUIRED_BY_JOB: Record<string, string[]> = {
	variants: ['courseId'],
	localize: ['courseId', 'target_lang'],
	hint: ['courseId', 'itemId'],
};

export async function templatesContractCheck() {
	const list = await listTemplates();
	const items: any[] = Array.isArray(list?.items) ? list.items : (Array.isArray(list) ? list : []);
	const issues: Array<{ id: string; jobType?: string; missingVars: string[]; detail: string }> = [];
	let checked = 0;
	for (const t of items) {
		const id = String(t?.id || t?.name || t);
		try {
			const full = await getTemplate({ params: { id } });
			const body: string = String(full?.content || full?.body || '');
			if (!body) continue;
			checked++;
			const m = body.match(/{{\s*([\w.]+)\s*}}/g) || [];
			const vars = new Set(m.map(s => s.replace(/[{}]/g, '').trim()));
			const jobType = String(full?.jobType || t?.jobType || '');
			const req = REQUIRED_BY_JOB[jobType] || [];
			const missing = req.filter(k => !vars.has(k));
			if (missing.length > 0) {
				issues.push({ id, jobType, missingVars: missing, detail: `Missing variables: ${missing.join(', ')}` });
			}
		} catch {
			// ignore individual fetch errors; produce a generic issue
			issues.push({ id, jobType: String(t?.jobType || ''), missingVars: [], detail: 'Failed to load template' });
		}
	}
	return { ok: issues.length === 0, checked, issues };
}

