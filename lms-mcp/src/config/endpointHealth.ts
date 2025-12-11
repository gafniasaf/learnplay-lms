export type EndpointProbe = {
	method: 'GET' | 'POST';
	path: string; // functions/v1/<route> or <route>?q=...
	expected: number; // expected status (e.g., 200 or 400 when missing body)
	tags?: Array<'auth_required' | 'public' | 'critical'>;
	body?: any;
};

// Minimal, extensible registry of key Edge endpoints to probe.
export const ENDPOINT_PROBES: EndpointProbe[] = [
	{ method: 'GET', path: 'list-jobs?limit=1', expected: 200, tags: ['auth_required', 'critical'] },
	{ method: 'GET', path: 'get-job?id=missing', expected: 400, tags: ['auth_required'] },
	{ method: 'POST', path: 'enqueue-job', expected: 400, tags: ['auth_required', 'critical'], body: { subject: '' } },
	{ method: 'POST', path: 'apply-job-result', expected: 400, tags: ['auth_required'] },
	{ method: 'POST', path: 'studytext-rewrite', expected: 400, tags: ['auth_required'] },
	// Add more as your project evolves
];


