import { config } from "../config.js";
import { fetchJson } from "../http.js";

export interface GenerateImageInput {
  courseId: string;
  itemId: number;
  prompt: string;
  style?: string;
  provider?: string;
}

export async function generateImage({ params }: { params: GenerateImageInput }) {
  const url = `${config.supabaseUrl}/functions/v1/generate-image`;
  const res = await fetchJson(url, {
    method: 'POST',
    headers: { 'X-Agent-Token': config.agentToken },
    body: params,
    timeoutMs: 20000,
  });
  if (!res.ok) {
    throw new Error(`generate-image failed (${res.status})`);
  }
  const attachments = res.json?.attachments || [];
  return { ok: true, attachments };
}


