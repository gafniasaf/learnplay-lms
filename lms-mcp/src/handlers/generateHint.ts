import { config } from "../config.js";
import { fetchJson } from "../http.js";

type Params = { courseId: string; itemId: number };

export async function generateHint({ params }: { params: Params }) {
  if (!params?.courseId || typeof params?.itemId !== 'number') {
    throw new Error('Invalid input for generateHint');
  }
  const url = `${config.supabaseUrl}/functions/v1/generate-hint`;
  const res = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: params,
    timeoutMs: 15000,
  });
  if (!res.ok) throw new Error(`generate-hint failed (${res.status}): ${res.json?.error || res.text}`);
  return res.json;
}


