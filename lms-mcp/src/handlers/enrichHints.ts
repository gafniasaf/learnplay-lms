import { config } from "../config.js";
import { fetchJson } from "../http.js";

type Params = { courseId: string; itemIds?: number[] };

export async function enrichHints({ params }: { params: Params }) {
  if (!params?.courseId || typeof params.courseId !== "string") {
    throw new Error("Invalid input for enrichHints: courseId is required");
  }
  if (params.itemIds !== undefined && !Array.isArray(params.itemIds)) {
    throw new Error("Invalid input for enrichHints: itemIds must be an array");
  }

  const url = `${config.supabaseUrl}/functions/v1/enrich-hints`;
  const res = await fetchJson(url, {
    method: "POST",
    headers: { "X-Agent-Token": config.agentToken },
    body: params,
    timeoutMs: 120000,
  });
  if (!res.ok) {
    throw new Error(`enrich-hints failed (${res.status}): ${res.json?.error || res.text}`);
  }
  return res.json;
}


