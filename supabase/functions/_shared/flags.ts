export function optionBEnabled(): boolean {
  const v = Deno.env.get('OPTION_B_ENABLED') || '';
  return v === '1' || v.toLowerCase() === 'true';
}

export function requireOptionB(reqId: string, req: Request): Response | null {
  if (optionBEnabled()) return null;
  // IMPORTANT: avoid non-200 to prevent Lovable blank screens.
  return new Response(JSON.stringify({ ok: false, error: { code: 'option_b_disabled', message: 'option_b_disabled' }, httpStatus: 403, requestId: reqId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}


