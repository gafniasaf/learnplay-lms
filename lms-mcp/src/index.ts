import http from "node:http";
import { URL, pathToFileURL } from "node:url";
import path from "node:path";
import { config } from "./config.js";
import { callJson } from "./http.js";
import "./polyfill.js"; // Polyfill Deno for local strategies (extension must be .js for NodeNext)
import { listLibraryCourses } from "./handlers/listLibraryCourses.js";
import { searchLibraryCourses } from "./handlers/searchLibraryCourses.js";
import { getLibraryCourseContent } from "./handlers/getLibraryCourseContent.js";

const METHODS = [
  "lms.health",
  "lms.enqueueJob",
  "lms.listJobs",
  "lms.getJob",
  "lms.logs",
  "lms.saveRecord",
  "lms.getRecord",
  "lms.listRecords",
  // Books (Book Studio / BookGen Pro)
  "lms.bookList",
  "lms.bookVersionInputUrls",
  "lms.bookVersionSaveSkeleton",
  "lms.bookCreateOverlay",
  "lms.bookSaveOverlay",
  "lms.bookEnqueueRender",
  "lms.bookArtifactUrl",
  "lms.bookLibraryImageUrl",
  "lms.bookLibraryUploadUrl",
  "lms.bookLibraryStorageUrl",
  "lms.bookLibraryUpsertIndex",
  "lms.bookLibraryGenerateImage",
  "lms.listLibraryCourses",
  "lms.searchLibraryCourses",
  "lms.getLibraryCourseContent",
  "lms.recommendMesContent",
  "lms.teacherChatAssistant",
] as const;

const BOOK_METHODS: Record<string, { edgeFunction: string; method: "GET" | "POST" }> = {
  "lms.bookList": { edgeFunction: "book-list", method: "GET" },
  "lms.bookVersionInputUrls": { edgeFunction: "book-version-input-urls", method: "POST" },
  "lms.bookVersionSaveSkeleton": { edgeFunction: "book-version-save-skeleton", method: "POST" },
  "lms.bookCreateOverlay": { edgeFunction: "book-create-overlay", method: "POST" },
  "lms.bookSaveOverlay": { edgeFunction: "book-save-overlay", method: "POST" },
  "lms.bookEnqueueRender": { edgeFunction: "book-enqueue-render", method: "POST" },
  "lms.bookArtifactUrl": { edgeFunction: "book-artifact-url", method: "POST" },
  "lms.bookLibraryImageUrl": { edgeFunction: "book-library-image-url", method: "POST" },
  "lms.bookLibraryUploadUrl": { edgeFunction: "book-library-upload-url", method: "POST" },
  "lms.bookLibraryStorageUrl": { edgeFunction: "book-library-storage-url", method: "POST" },
  "lms.bookLibraryUpsertIndex": { edgeFunction: "book-library-upsert-index", method: "POST" },
  "lms.bookLibraryGenerateImage": { edgeFunction: "book-library-generate-image", method: "POST" },
};

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url) {
    const url = new URL(req.url, `http://${config.host}:${config.port}`);
    if (url.pathname === "/health") {
      return send(res, 200, { ok: true, methods: METHODS });
    }
  }

  if (req.method !== "POST") {
    return send(res, 405, { ok: false, error: "Method Not Allowed" });
  }

  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token !== config.mcpAuthToken) {
    return send(res, 401, { ok: false, error: "Unauthorized" });
  }

  try {
    const body = await readBody(req);
    const { method, params = {} } = body ?? {};
    if (!method || typeof method !== "string") {
      return send(res, 400, { ok: false, error: "method is required" });
    }

    switch (method) {
      case "lms.health": {
        return send(res, 200, { ok: true, methods: METHODS });
      }
      case "lms.enqueueJob": {
        const result = await enqueueJob(params);
        return send(res, 200, { ok: true, result });
      }
      case "lms.listJobs": {
        const result = await listJobs(params);
        return send(res, 200, { ok: true, result });
      }
      case "lms.getJob": {
        const result = await getJob(params);
        return send(res, 200, { ok: true, result });
      }
      case "lms.logs": {
        const result = await logs(params);
        return send(res, 200, { ok: true, result });
      }
      case "lms.saveRecord": {
        const result = await saveRecord(params);
        return send(res, 200, { ok: true, result });
      }
      case "lms.getRecord": {
        const result = await getRecord(params);
        return send(res, 200, { ok: true, result });
      }
      case "lms.listRecords": {
        const result = await listRecords(params);
        return send(res, 200, { ok: true, result });
      }
      case "lms.listLibraryCourses": {
        const result = await listLibraryCourses({ params });
        return send(res, 200, { ok: true, result });
      }
      case "lms.searchLibraryCourses": {
        const result = await searchLibraryCourses({ params });
        return send(res, 200, { ok: true, result });
      }
      case "lms.getLibraryCourseContent": {
        const result = await getLibraryCourseContent({ params });
        return send(res, 200, { ok: true, result });
      }
      case "lms.recommendMesContent": {
        const result = await recommendMesContent(params);
        return send(res, 200, { ok: true, result });
      }
      case "lms.teacherChatAssistant": {
        const result = await teacherChatAssistant(params);
        return send(res, 200, { ok: true, result });
      }
      default:
        if (BOOK_METHODS[method]) {
          const result = await callBookMethod({ method, params });
          return send(res, 200, { ok: true, result });
        }
        return send(res, 404, { ok: false, error: `Unknown method: ${method}` });
    }
  } catch (error) {
    console.error("MCP Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return send(res, 500, { ok: false, error: message });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`MCP server listening on http://${config.host}:${config.port}`);
});

function requireOrganizationId(): string {
  if (!config.organizationId) {
    throw new Error("BLOCKED: ORGANIZATION_ID is REQUIRED for MCP proxy calls (agent auth requires org scope)");
  }
  return config.organizationId;
}

async function enqueueJob(params: any) {
  const jobType = params?.jobType;
  if (!jobType || typeof jobType !== "string") {
    throw new Error("jobType is required");
  }
  const payload = (params?.payload && typeof params.payload === "object") ? params.payload : {};

  // LOCAL RUNNER OVERRIDE
  // If USE_LOCAL_RUNNER is set, execute strategy locally instead of calling Edge Function
  if (process.env.USE_LOCAL_RUNNER === 'true') {
    console.log(`[LocalRunner] Executing job: ${jobType}`);
    try {
      // Resolve path relative to lms-mcp root (cwd is lms-mcp usually)
      // strategies are in ../supabase/functions/ai-job-runner/registry.ts
      const registryPath = path.resolve(process.cwd(), '../supabase/functions/ai-job-runner/registry.ts');
      const { JobRegistry } = await import(pathToFileURL(registryPath).href);
      
      const strategy = JobRegistry[jobType];
      if (!strategy) {
        throw new Error(`No local strategy found for jobType: ${jobType}`);
      }

      const result = await strategy.execute({ jobType, payload });
      console.log(`[LocalRunner] Job ${jobType} completed.`);
      return { status: 'completed', result };
    } catch (error) {
      console.error(`[LocalRunner] Job ${jobType} failed:`, error);
      throw error;
    }
  }

  return supabaseFetch("enqueue-job", {
    method: "POST",
    headers: { "X-Agent-Token": config.agentToken, "X-Organization-Id": requireOrganizationId() },
    body: { jobType, payload },
  });
}

async function listJobs(params: any) {
  const limit = Math.min(100, Math.max(1, Number(params?.limit || 20)));
  const status = typeof params?.status === "string" ? params.status.trim() : "";
  const search = typeof params?.search === "string" ? params.search.trim() : "";
  const jobType = typeof params?.jobType === "string" ? params.jobType.trim() : "";
  const sinceHours = Number.isFinite(Number(params?.sinceHours)) ? Number(params.sinceHours) : null;

  const sp = new URLSearchParams();
  sp.set("limit", String(limit));
  if (status) sp.set("status", status);
  if (search) sp.set("search", search);
  if (jobType) sp.set("jobType", jobType);
  if (sinceHours && sinceHours > 0) sp.set("sinceHours", String(sinceHours));

  const path = `list-jobs?${sp.toString()}`;
  const resp = await supabaseFetch(path, {
    method: "GET",
    headers: { "X-Agent-Token": config.agentToken, "X-Organization-Id": requireOrganizationId() },
  });
  if (!resp.ok) {
    throw new Error(`listJobs failed (${resp.status}) ${resp.text || ""}`);
  }
  return resp.json;
}

async function getJob(params: any) {
  const id = params?.id;
  if (!id || typeof id !== "string") {
    throw new Error("id is required");
  }
  return supabaseFetch(`get-job?id=${encodeURIComponent(id)}`, { 
    method: "GET",
    headers: { "X-Agent-Token": config.agentToken, "X-Organization-Id": requireOrganizationId() },
  });
}

async function logs(params: any) {
  const jobId = params?.jobId ?? params?.id;
  if (!jobId || typeof jobId !== "string") {
    throw new Error("jobId is required");
  }

  let limit = 200;
  const rawLimit = params?.eventsLimit ?? params?.limit;
  if (typeof rawLimit === "number" && Number.isFinite(rawLimit)) {
    limit = Math.max(1, Math.min(200, Math.floor(rawLimit)));
  }

  const resp = await supabaseFetch(
    `get-job?id=${encodeURIComponent(jobId)}&eventsLimit=${encodeURIComponent(String(limit))}`,
    {
      method: "GET",
      headers: { "X-Agent-Token": config.agentToken, "X-Organization-Id": requireOrganizationId() },
    }
  );

  if (!resp.ok) {
    throw new Error(`logs failed (${resp.status}) ${resp.text || ""}`);
  }

  const data: any = resp.json || {};
  const ev = data.events || data.job?.events || data.job_events || [];
  return Array.isArray(ev) ? ev : [];
}

async function saveRecord(params: any) {
  const entity = params?.entity;
  const values = params?.values;
  if (!entity || typeof entity !== "string") {
    throw new Error("entity is required");
  }
  if (!values || typeof values !== "object") {
    throw new Error("values is required");
  }
  return supabaseFetch("save-record", {
    method: "POST",
    headers: { "X-Agent-Token": config.agentToken, "X-Organization-Id": requireOrganizationId() },
    body: { entity, values },
  });
}

async function getRecord(params: any) {
  const entity = params?.entity;
  const id = params?.id;
  if (!entity || typeof entity !== "string") throw new Error("entity is required");
  if (!id || typeof id !== "string") throw new Error("id is required");
  return supabaseFetch(`get-record?entity=${entity}&id=${id}`, { 
    method: "GET",
    headers: { "X-Agent-Token": config.agentToken, "X-Organization-Id": requireOrganizationId() },
  });
}

async function listRecords(params: any) {
  const entity = params?.entity;
  if (!entity || typeof entity !== "string") {
    throw new Error("entity is required");
  }
  const limit = Math.min(100, Math.max(1, Number(params?.limit ?? 20)));
  return supabaseFetch("list-records", {
    method: "POST",
    headers: { "X-Agent-Token": config.agentToken, "X-Organization-Id": requireOrganizationId() },
    body: { entity, limit },
  });
}

async function recommendMesContent(params: any) {
  const query = params?.query;
  if (!query || typeof query !== "string") {
    throw new Error("query is required");
  }
  const limit = typeof params?.limit === "number" && Number.isFinite(params.limit) ? Math.floor(params.limit) : 5;
  return supabaseFetch("recommend-mes-content", {
    method: "POST",
    headers: { "X-Agent-Token": config.agentToken, "X-Organization-Id": requireOrganizationId() },
    body: { query, limit },
  });
}

async function teacherChatAssistant(params: any) {
  const messages = params?.messages;
  if (!Array.isArray(messages)) {
    throw new Error("messages is required (array)");
  }
  const scope = typeof params?.scope === "string" ? params.scope : "all";
  const materialId = typeof params?.materialId === "string" ? params.materialId : undefined;
  return supabaseFetch("teacher-chat-assistant", {
    method: "POST",
    headers: { "X-Agent-Token": config.agentToken, "X-Organization-Id": requireOrganizationId() },
    body: { messages, scope, ...(materialId ? { materialId } : {}) },
  });
}

async function callBookMethod({ method, params }: { method: string; params: any }) {
  const spec = BOOK_METHODS[method];
  if (!spec) {
    throw new Error(`Unknown book method: ${method}`);
  }

  const headers = {
    "X-Agent-Token": config.agentToken,
    "X-Organization-Id": requireOrganizationId(),
  };

  if (spec.method === "GET") {
    const qs = new URLSearchParams();
    const obj = params && typeof params === "object" && !Array.isArray(params) ? params : {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      qs.set(k, String(v));
    }
    const path = qs.toString() ? `${spec.edgeFunction}?${qs.toString()}` : spec.edgeFunction;
    const resp = await supabaseFetch(path, { method: "GET", headers });
    if (!resp.ok) {
      throw new Error(`[${method}] ${resp.status}: ${resp.text || ""}`);
    }
    return resp.json;
  }

  const resp = await supabaseFetch(spec.edgeFunction, { method: "POST", headers, body: params ?? {} });
  if (!resp.ok) {
    throw new Error(`[${method}] ${resp.status}: ${resp.text || ""}`);
  }
  return resp.json;
}

function supabaseFetch(path: string, opts: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: unknown } = {}) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = `${config.supabaseUrl}/functions/v1/${normalizedPath}`;
  const headers = {
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${config.supabaseAnonKey}`,
    ...(config.organizationId ? { "X-Organization-Id": config.organizationId } : {}),
    ...(opts.headers || {}),
  };
  return callJson(url, { method: opts.method, headers, body: opts.body });
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function send(res: http.ServerResponse, status: number, body: Record<string, unknown>) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
