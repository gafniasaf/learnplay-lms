export function optionBEnabled(): boolean {
  const v = Deno.env.get('OPTION_B_ENABLED') || '';
  return v === '1' || v.toLowerCase() === 'true';
}

export function requireOptionB(reqId: string, req: Request): Response | null {
  if (optionBEnabled()) return null;
  return new Response(JSON.stringify({ error: 'option_b_disabled', requestId: reqId }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}


