import http from "node:http";
import { URL, pathToFileURL } from "node:url";
import path from "node:path";
import { config } from "./config.ts";
import { callJson } from "./http.ts";
import "./polyfill.ts"; // Polyfill Deno for local strategies
import { z } from "zod";

// Import all handlers
import { health as hHealth } from "./handlers/health.ts";
import { getCourse as hGetCourse } from "./handlers/getCourse.ts";
import { saveCourse as hSaveCourse } from "./handlers/saveCourse.ts";
import { publishCourse as hPublishCourse } from "./handlers/publishCourse.ts";
import { listCourses as hListCourses } from "./handlers/listCourses.ts";
import { listJobs as hListJobs } from "./handlers/listJobs.ts";
import { getJob as hGetJob } from "./handlers/getJob.ts";
import { logs as hLogs } from "./handlers/logs.ts";
import { enqueueJob as hEnqueueJob } from "./handlers/enqueueJob.ts";
import { enqueueAndTrack as hEnqueueAndTrack } from "./handlers/enqueueAndTrack.ts";
import { applyJobResult as hApplyJobResult } from "./handlers/applyJobResult.ts";
import { validateCourse as hValidateCourse } from "./handlers/validateCourse.ts";
import { repairCourse as hRepairCourse } from "./handlers/repairCourse.ts";
import { variantsAudit as hVariantsAudit } from "./handlers/variantsAudit.ts";
import { variantsGenerateMissing as hVariantsGenerateMissing } from "./handlers/variantsGenerateMissing.ts";
import { autoFix as hAutoFix } from "./handlers/autoFix.ts";
import { localize as hLocalize } from "./handlers/localize.ts";
import { generateImage as hGenerateImage } from "./handlers/generateImage.ts";
import { generateHint as hGenerateHint } from "./handlers/generateHint.ts";
import { listMediaJobs as hListMediaJobs } from "./handlers/listMediaJobs.ts";
import { getMediaJob as hGetMediaJob } from "./handlers/getMediaJob.ts";
import { enqueueMedia as hEnqueueMedia } from "./handlers/enqueueMedia.ts";
import { enqueueMediaAndTrack as hEnqueueMediaAndTrack } from "./handlers/enqueueMediaAndTrack.ts";
import { enqueueCourseMediaMissing as hEnqueueCourseMediaMissing } from "./handlers/enqueueCourseMediaMissing.ts";
import { getFormatRegistry as hGetFormatRegistry } from "./handlers/getFormatRegistry.ts";
import { itemGenerateMore as hItemGenerateMore } from "./handlers/itemGenerateMore.ts";
import { itemRewriteQuality as hItemRewriteQuality } from "./handlers/itemRewriteQuality.ts";
import { itemClusterAudit as hItemClusterAudit } from "./handlers/itemClusterAudit.ts";
import { studytextRewrite as hStudytextRewrite, studytextExpand as hStudytextExpand, studytextVisualize as hStudytextVisualize } from "./handlers/studytextHandlers.ts";
import { listTemplates as hListTemplates, getTemplate as hGetTemplate } from "./handlers/templates.ts";
import { metricsSummary as hMetricsSummary, metricsRecent as hMetricsRecent, metricsReset as hMetricsReset } from "./handlers/metrics.ts";
import { getOrgSettings as hGetOrgSettings, saveOrgSettings as hSaveOrgSettings } from "./handlers/orgSettings.ts";
import { functionInfo as hFunctionInfo } from "./handlers/functionInfo.ts";
import { checkAuthHealth as hCheckAuthHealth } from "./handlers/checkAuthHealth.ts";
import { edgeSmoke as hEdgeSmoke } from "./handlers/edgeSmoke.ts";
import { jobsHealth as hJobsHealth } from "./handlers/jobsHealth.ts";
import { rlsProbe as hRlsProbe } from "./handlers/rlsProbe.ts";
import { templatesContractCheck as hTemplatesContractCheck } from "./handlers/templatesContractCheck.ts";
import { autoFixBatch as hAutoFixBatch } from "./handlers/autoFixBatch.ts";
import { courseCacheCheck as hCourseCacheCheck } from "./handlers/courseCacheCheck.ts";
import { prPreviewSmoke as hPrPreviewSmoke } from "./handlers/prPreviewSmoke.ts";
import { contractsSnapshot as hContractsSnapshot } from "./handlers/contractsSnapshot.ts";
import { checkStorageIntegrity as hCheckStorageIntegrity } from "./handlers/checkStorageIntegrity.ts";
import { bootFailureAudit as hBootFailureAudit } from "./handlers/bootFailureAudit.ts";
import { envAudit as hEnvAudit } from "./handlers/envAudit.ts";
import { deadJobAudit as hDeadJobAudit } from "./handlers/deadJobAudit.ts";
import { fallbackAudit as hFallbackAudit } from "./handlers/fallbackAudit.ts";
import { roundtripSeeds as hRoundtripSeeds, roundtripTest as hRoundtripTest } from "./handlers/roundtrip.ts";
import { formatRegistryAudit as hFormatRegistryAudit } from "./handlers/formatRegistryAudit.ts";
import { latentErrorScan as hLatentErrorScan } from "./handlers/latentErrorScan.ts";
import { coverageAudit as hCoverageAudit } from "./handlers/coverageAudit.ts";
import { run as hUiAuditRun, summary as hUiAuditSummary } from "./handlers/uiAudit.ts";
import { uiAuditFix as hUiAuditFix, uiAuditReport as hUiAuditReport } from "./handlers/uiAuditFix.ts";

// Legacy handlers (keep for backward compatibility)
async function enqueueJobLegacy(params: any) {
  const jobType = params?.jobType;
  if (!jobType || typeof jobType !== "string") {
    throw new Error("jobType is required");
  }
  const payload = (params?.payload && typeof params.payload === "object") ? params.payload : {};

  // LOCAL RUNNER OVERRIDE
  if (process.env.USE_LOCAL_RUNNER === 'true') {
    console.log(`[LocalRunner] Executing job: ${jobType}`);
    try {
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
    headers: { "X-Agent-Token": config.agentToken },
    body: { jobType, payload },
  });
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
    headers: { "X-Agent-Token": config.agentToken },
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
    headers: { "X-Agent-Token": config.agentToken },
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
    headers: { "X-Agent-Token": config.agentToken },
    body: { entity, limit },
  });
}

type Handler = (params: any) => Promise<any>;

const routes: Record<string, { schema: z.ZodTypeAny; handler: Handler }> = {
  "lms.health": { schema: z.object({}).optional().default({}), handler: async () => hHealth() },
  "lms.getCourse": { schema: z.object({ courseId: z.string().min(1) }), handler: (p) => hGetCourse({ params: p }) },
  "lms.saveCourse": { schema: z.object({ envelope: z.any() }), handler: (p) => hSaveCourse({ params: p }) },
  "lms.publishCourse": { schema: z.object({ courseId: z.string().min(1), changelog: z.string().optional() }), handler: (p) => hPublishCourse({ params: p }) },
  "lms.listCourses": { schema: z.object({ includeArchived: z.boolean().optional(), limit: z.number().int().positive().max(1000).optional() }), handler: (p) => hListCourses({ params: p }) },
  "lms.listJobs": { schema: z.object({ page: z.number().int().min(1).optional(), limit: z.number().int().min(1).max(200).optional() }), handler: (p) => hListJobs({ params: p }) },
  "lms.getJob": { schema: z.object({ jobId: z.string().min(1) }), handler: (p) => hGetJob({ params: p }) },
  "lms.logs": { schema: z.object({ jobId: z.string().min(1) }), handler: (p) => hLogs({ params: p }) },
  "lms.enqueueJob": { schema: z.object({ type: z.string(), subject: z.string().min(1), courseId: z.string().optional(), locale: z.string().optional(), payload: z.any().optional() }), handler: (p) => hEnqueueJob({ params: p }) },
  "lms.enqueueAndTrack": { schema: z.object({ type: z.string(), subject: z.string().min(1), courseId: z.string().optional(), locale: z.string().optional(), payload: z.any().optional(), timeoutSec: z.number().optional(), pollIntervalMs: z.number().optional() }), handler: (p) => hEnqueueAndTrack({ params: p }) },
  "lms.applyJobResult": { schema: z.object({ jobId: z.string().min(1), courseId: z.string().min(1), mergePlan: z.any().optional(), attachments: z.array(z.any()).optional(), dryRun: z.boolean().optional() }), handler: (p) => hApplyJobResult({ params: p }) },
  "lms.validateCourseStructure": { schema: z.object({ courseId: z.string().min(1) }), handler: (p) => hValidateCourse({ params: p }) },
  "lms.repairCourse": { schema: z.object({ courseId: z.string().min(1), jobId: z.string().uuid().optional(), dryRun: z.boolean().optional() }), handler: (p) => hRepairCourse({ params: p }) },
  "lms.variantsAudit": { schema: z.object({ courseId: z.string().min(1) }), handler: (p) => hVariantsAudit({ params: p }) },
  "lms.variantsGenerateMissing": { schema: z.object({ courseId: z.string().min(1), axes: z.array(z.string()).optional(), dryRun: z.boolean().optional(), jobId: z.string().uuid().optional() }), handler: (p) => hVariantsGenerateMissing({ params: p }) },
  "lms.autoFix": { schema: z.object({ courseId: z.string().min(1), apply: z.boolean().optional() }), handler: (p) => hAutoFix({ params: p }) },
  "lms.localize": { schema: z.object({ courseId: z.string().min(1), target_lang: z.string().min(2).max(10) }), handler: (p) => hLocalize({ params: p }) },
  "lms.generateImage": { schema: z.object({ courseId: z.string().min(1), itemId: z.number().int().min(0), prompt: z.string().min(1), style: z.string().optional() }), handler: (p) => hGenerateImage({ params: p }) },
  "lms.generateHint": { schema: z.object({ courseId: z.string().min(1), itemId: z.number().int().nonnegative() }), handler: (p) => hGenerateHint({ params: p }) },
  "lms.listMediaJobs": { schema: z.object({ courseId: z.string().optional(), status: z.enum(['pending','processing','done','failed']).optional(), limit: z.number().int().min(1).max(100).optional() }), handler: (p) => hListMediaJobs({ params: p }) },
  "lms.getMediaJob": { schema: z.object({ id: z.string().min(1) }), handler: (p) => hGetMediaJob({ params: p }) },
  "lms.enqueueMedia": { schema: z.object({ courseId: z.string().min(1), itemId: z.number().int().min(0), prompt: z.string().min(1), style: z.string().optional(), provider: z.enum(['openai','replicate','stable']).optional(), mediaType: z.enum(['image']).optional() }), handler: (p) => hEnqueueMedia({ params: p }) },
  "lms.enqueueMediaAndTrack": { schema: z.object({ courseId: z.string().min(1), itemId: z.number().int().min(0), prompt: z.string().min(1), style: z.string().optional(), provider: z.enum(['openai','replicate','stable']).optional(), mediaType: z.enum(['image']).optional(), timeoutSec: z.number().optional(), pollIntervalMs: z.number().optional() }), handler: (p) => hEnqueueMediaAndTrack({ params: p }) },
  "lms.enqueueCourseMediaMissing": { schema: z.object({ courseId: z.string().min(1), limit: z.number().int().positive().max(200).optional(), dryRun: z.boolean().optional(), promptTemplate: z.string().optional() }), handler: (p) => hEnqueueCourseMediaMissing({ params: p }) },
  "lms.getFormatRegistry": { schema: z.object({}).optional().default({}), handler: () => hGetFormatRegistry() },
  "lms.itemGenerateMore": { schema: z.object({ courseId: z.string().min(1), count: z.number().int().positive().max(50).optional() }), handler: (p) => hItemGenerateMore({ params: p }) },
  "lms.itemRewriteQuality": { schema: z.object({ courseId: z.string().min(1), itemId: z.number().int().nonnegative() }), handler: (p) => hItemRewriteQuality({ params: p }) },
  "lms.itemClusterAudit": { schema: z.object({ courseId: z.string().min(1) }), handler: (p) => hItemClusterAudit({ params: p }) },
  "lms.studytextRewrite": { schema: z.object({ courseId: z.string().min(1), index: z.number().int().nonnegative().optional() }), handler: (p) => hStudytextRewrite({ params: p }) },
  "lms.studytextExpand": { schema: z.object({ courseId: z.string().min(1), index: z.number().int().nonnegative().optional() }), handler: (p) => hStudytextExpand({ params: p }) },
  "lms.studytextVisualize": { schema: z.object({ courseId: z.string().min(1), index: z.number().int().nonnegative().optional() }), handler: (p) => hStudytextVisualize({ params: p }) },
  "lms.listTemplates": { schema: z.object({}).optional().default({}), handler: () => hListTemplates() },
  "lms.getTemplate": { schema: z.object({ id: z.string().min(1) }), handler: (p) => hGetTemplate({ params: p }) },
  "lms.metrics.summary": { schema: z.object({}).optional().default({}), handler: () => hMetricsSummary() },
  "lms.metrics.recent": { schema: z.object({ limit: z.number().int().positive().max(1000).optional() }), handler: (p) => hMetricsRecent({ params: p }) },
  "lms.metrics.reset": { schema: z.object({}).optional().default({}), handler: () => hMetricsReset() },
  "lms.getOrgSettings": { schema: z.object({ orgId: z.string().uuid().optional() }), handler: (p) => hGetOrgSettings({ params: p }) },
  "lms.saveOrgSettings": { schema: z.object({ orgId: z.string().uuid(), thresholds: z.object({ variantsCoverageMin: z.number().min(0).max(1) }) }), handler: (p) => hSaveOrgSettings({ params: p }) },
  "lms.functionInfo": { schema: z.object({ functionSlug: z.string().optional() }), handler: (p) => hFunctionInfo({ params: p }) },
  // Guardrails
  "lms.checkAuthHealth": { schema: z.object({}).optional().default({}), handler: async () => hCheckAuthHealth() },
  "lms.edgeSmoke": { schema: z.object({}).optional().default({}), handler: async () => hEdgeSmoke() },
  "lms.jobs.health": { schema: z.object({ maxQueuedMin: z.number().int().positive().optional(), maxProcessingMin: z.number().int().positive().optional() }).optional().default({}), handler: (p) => hJobsHealth({ params: p }) },
  "lms.rlsProbe": { schema: z.object({}).optional().default({}), handler: async () => hRlsProbe() },
  "lms.templates.checkContracts": { schema: z.object({}).optional().default({}), handler: async () => hTemplatesContractCheck() },
  "lms.autoFixBatch": { schema: z.object({ orgId: z.string().optional(), limit: z.number().int().positive().max(10).optional(), apply: z.boolean().optional() }).optional().default({}), handler: (p) => hAutoFixBatch({ params: p }) },
  "lms.courseCacheCheck": { schema: z.object({ courseId: z.string().min(1) }), handler: (p) => hCourseCacheCheck({ params: p }) },
  "lms.prPreviewSmoke": { schema: z.object({ courseId: z.string().min(1).optional(), type: z.enum(['variants','localize']).optional() }).optional().default({}), handler: (p) => hPrPreviewSmoke({ params: p }) },
  "lms.contracts.snapshot": { schema: z.object({}).optional().default({}), handler: async () => hContractsSnapshot() },
  // Diagnostics
  "lms.checkStorageIntegrity": { schema: z.object({ courseId: z.string().min(1), autoRepair: z.boolean().optional() }), handler: (p) => hCheckStorageIntegrity({ params: p }) },
  "lms.bootFailureAudit": { schema: z.object({}).optional().default({}), handler: async () => hBootFailureAudit() },
  "lms.envAudit": { schema: z.object({}).optional().default({}), handler: async () => hEnvAudit() },
  "lms.deadJobAudit": { schema: z.object({ maxQueuedMin: z.number().int().positive().optional(), maxProcessingMin: z.number().int().positive().optional() }).optional().default({}), handler: (p) => hDeadJobAudit({ params: p }) },
  "lms.fallbackAudit": { schema: z.object({ courseId: z.string().min(1) }), handler: (p) => hFallbackAudit({ params: p }) },
  "lms.roundtripSeeds": { schema: z.object({ method: z.string().optional() }).optional().default({}), handler: (p) => hRoundtripSeeds({ params: p }) },
  "lms.roundtripTest": { schema: z.object({ method: z.string().min(1), variant: z.string().optional(), args: z.record(z.any()).optional() }), handler: (p) => hRoundtripTest({ params: p }) },
  "lms.formatRegistryAudit": { schema: z.object({}).optional().default({}), handler: async () => hFormatRegistryAudit() },
  "lms.latentErrorScan": { schema: z.object({}).optional().default({}), handler: async () => hLatentErrorScan() },
  "lms.coverageAudit": { schema: z.object({}).optional().default({}), handler: async () => hCoverageAudit() },
  // UI audit
  "lms.uiAudit.run": { schema: z.object({}).optional().default({}), handler: async () => hUiAuditRun() },
  "lms.uiAudit.summary": { schema: z.object({}).optional().default({}), handler: async () => hUiAuditSummary() },
  "lms.uiAudit.fix": { schema: z.object({ dryRun: z.boolean().optional(), autoRemove: z.boolean().optional(), root: z.string().optional(), sourceDir: z.string().optional() }).optional().default({}), handler: (p) => hUiAuditFix({ params: p }) },
  "lms.uiAudit.report": { schema: z.object({}).optional().default({}), handler: async () => hUiAuditReport() },
  // Legacy handlers (backward compatibility)
  "lms.saveRecord": { schema: z.object({ entity: z.string(), values: z.any() }), handler: (p) => saveRecord(p) },
  "lms.getRecord": { schema: z.object({ entity: z.string(), id: z.string() }), handler: (p) => getRecord(p) },
  "lms.listRecords": { schema: z.object({ entity: z.string(), limit: z.number().optional() }), handler: (p) => listRecords(p) },
};

const METHODS = Object.keys(routes);

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
    if (url.pathname === "/health" || url.pathname === "/") {
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

    const route = routes[method];
    if (!route) {
      return send(res, 404, { ok: false, error: `Unknown method: ${method}` });
    }

    const parsed = route.schema.safeParse(params);
    if (!parsed.success) {
      return send(res, 400, { ok: false, error: "Invalid input", details: parsed.error.flatten() });
    }

    const data = await route.handler(parsed.data);
    return send(res, 200, { ok: true, data });
  } catch (error) {
    console.error("MCP Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return send(res, 500, { ok: false, error: message });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`MCP server listening on http://${config.host}:${config.port}`);
});

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
