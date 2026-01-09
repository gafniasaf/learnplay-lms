import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMCP } from "@/hooks/useMCP";

type BookRow = {
  id: string;
  title: string;
  level?: string | null;
  source?: string | null;
};

type BookVersionRow = {
  book_id: string;
  book_version_id: string;
  canonical_path: string;
  status?: string | null;
  exported_at?: string | null;
  authoring_mode?: string | null;
  skeleton_schema_version?: string | null;
};

type AgentJobRow = {
  id: string;
  job_type: string;
  status: string;
  payload?: any;
  result?: any;
  error?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
};

type JobEventRow = {
  created_at?: string;
  level?: string;
  message?: string;
  progress?: number;
};

type BookListResponse =
  | { ok: true; scope: string; books?: BookRow[]; versions?: BookVersionRow[]; total: number; limit: number; offset: number }
  | { ok: false; error: any; httpStatus?: number };

type BookVersionInputUrlsResponse =
  | {
      ok: true;
      bookId: string;
      bookVersionId: string;
      urls: {
        canonical?: { path: string; signedUrl: string } | null;
        compiledCanonical?: { path: string; signedUrl: string } | null;
        skeleton?: { path: string; signedUrl: string } | null;
      };
      authoringMode?: string | null;
      skeletonSchemaVersion?: string | null;
      requestId?: string;
    }
  | { ok: false; error: { code?: string; message?: string } | any; httpStatus?: number; requestId?: string };

type ListJobsResponse =
  | { ok: true; jobs: AgentJobRow[] }
  | { ok: false; error: any; httpStatus?: number };

type GetJobResponse =
  | { ok: true; job: AgentJobRow; events: JobEventRow[] }
  | { ok: false; error: any; httpStatus?: number };

export type MonitorStatus = "generating" | "paused" | "failed" | "completed" | "idle";

export type ChapterStatus = "done" | "active" | "queued" | "failed" | "pending";

export type ChapterVm = {
  index: number;
  title: string;
  sectionCount: number;
  doneSections: number;
  status: ChapterStatus;
};

export type ContentStats = {
  verdieping: number;
  praktijk: number;
  figures: number;
};

export type TimingStats = {
  elapsed: string;
  remaining: string;
  eta: string;
  speed: string;
};

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function safeNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function isCanonicalHashVersionId(id: string): boolean {
  const s = safeStr(id).trim();
  // Canonical ingest uses a deterministic SHA256 hex version id (64 chars).
  return /^[a-f0-9]{64}$/i.test(s);
}

function bestVersion(versions: BookVersionRow[]): BookVersionRow | null {
  if (!versions.length) return null;
  const active = versions.filter((v) => safeStr(v.status) === "active");
  const pool = active.length ? active : versions;

  // Prefer deterministic (canonical-ingest) versions when present, since they tend to contain the full
  // chapter structure (e.g. 14 chapters) while some UUID-based experiment versions may be partial.
  const canon = pool.filter((v) => isCanonicalHashVersionId(v.book_version_id));
  const candidates = canon.length ? canon : pool;

  const sorted = [...candidates].sort((a, b) => safeStr(b.exported_at).localeCompare(safeStr(a.exported_at)));
  return sorted[0] || null;
}

function walkJson(value: any, visitor: (obj: any) => void) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const v of value) walkJson(v, visitor);
    return;
  }
  if (typeof value === "object") {
    visitor(value);
    for (const v of Object.values(value)) walkJson(v, visitor);
  }
}

function formatHms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function useBookGenMonitor() {
  const mcp = useMCP();

  const [books, setBooks] = useState<BookRow[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string>("");
  const [versions, setVersions] = useState<BookVersionRow[]>([]);
  const [selectedBookVersionId, setSelectedBookVersionId] = useState<string>("");

  const [chapters, setChapters] = useState<Array<{ title: string; sectionCount: number }>>([]);
  const [canonicalReady, setCanonicalReady] = useState(false);
  const [canonicalError, setCanonicalError] = useState<string>("");
  const [skeletonReady, setSkeletonReady] = useState<boolean | null>(null);
  const [skeletonMeta, setSkeletonMeta] = useState<{ language: string; level: string; schemaVersion: string } | null>(null);
  const [contentStats, setContentStats] = useState<ContentStats>({ verdieping: 0, praktijk: 0, figures: 0 });

  const [jobs, setJobs] = useState<AgentJobRow[]>([]);
  const [activeJobId, setActiveJobId] = useState<string>("");
  const [events, setEvents] = useState<JobEventRow[]>([]);

  const [control, setControl] = useState<{ paused: boolean; cancelled: boolean; note: string | null; updated_at: string | null } | null>(null);
  const [controlError, setControlError] = useState<string>("");

  const [loading, setLoading] = useState(false);

  const pollTimer = useRef<number | null>(null);
  const eventsTimer = useRef<number | null>(null);

  const selectedBook = useMemo(() => books.find((b) => b.id === selectedBookId) || null, [books, selectedBookId]);
  const chapterCount = chapters.length;

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await mcp.callGet("lms.bookList", {
        scope: "books",
        limit: "200",
        offset: "0",
      })) as BookListResponse;
      if ((res as any)?.ok !== true) throw new Error((res as any)?.error?.message || "Failed to load books");
      setBooks((res as any).books || []);
    } catch (e) {
      // Never let transient Edge/network errors crash the monitor UI.
      console.warn("[useBookGenMonitor] loadBooks failed:", e);
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }, [mcp]);

  const loadVersions = useCallback(async () => {
    const bookId = selectedBookId.trim();
    if (!bookId) {
      setVersions([]);
      return;
    }
    setLoading(true);
    try {
      const res = (await mcp.callGet("lms.bookList", {
        scope: "versions",
        bookId,
        limit: "200",
        offset: "0",
      })) as BookListResponse;
      if ((res as any)?.ok !== true) throw new Error((res as any)?.error?.message || "Failed to load versions");

      const vs = (res as any).versions || [];
      setVersions(vs);

      // Default selection if missing
      if (!selectedBookVersionId) {
        const v = bestVersion(vs);
        if (v?.book_version_id) setSelectedBookVersionId(v.book_version_id);
      }
    } catch (e) {
      console.warn("[useBookGenMonitor] loadVersions failed:", e);
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [mcp, selectedBookId, selectedBookVersionId]);

  const loadCanonical = useCallback(async () => {
    const bookId = selectedBookId.trim();
    const bookVersionId = selectedBookVersionId.trim();
    setCanonicalReady(false);
    setCanonicalError("");
    setChapters([]);
    setSkeletonReady(null);
    setSkeletonMeta(null);
    setContentStats({ verdieping: 0, praktijk: 0, figures: 0 });

    if (!bookId || !bookVersionId) return;
    setLoading(true);
    try {
      const urlsRes = (await mcp.call("lms.bookVersionInputUrls", {
        bookId,
        bookVersionId,
        expiresIn: 3600,
        target: "book",
        allowMissingImages: true,
      })) as BookVersionInputUrlsResponse;

      if ((urlsRes as any)?.ok !== true) {
        throw new Error((urlsRes as any)?.error?.message || "Failed to sign URLs");
      }

      const urls = (urlsRes as any).urls || {};
      const canonicalUrl = safeStr(urls?.compiledCanonical?.signedUrl || urls?.canonical?.signedUrl);
      const skeletonUrl = safeStr(urls?.skeleton?.signedUrl || "");
      setSkeletonReady(Boolean(skeletonUrl));

      if (skeletonUrl) {
        try {
          const sr = await fetch(skeletonUrl);
          if (sr.ok) {
            const sk = await sr.json().catch(() => null);
            const meta = sk && typeof sk === "object" ? (sk as any).meta : null;
            const language = safeStr(meta?.language).trim();
            const level = safeStr(meta?.level).trim();
            const schemaVersion = safeStr(meta?.schemaVersion).trim();
            if (language && level && schemaVersion) {
              setSkeletonMeta({ language, level, schemaVersion });
            }
          }
        } catch {
          // best-effort
        }
      }

      if (!canonicalUrl) {
        throw new Error("BLOCKED: Missing canonical URL for this version");
      }

      const r = await fetch(canonicalUrl);
      if (!r.ok) throw new Error(`Failed to download canonical (${r.status})`);
      const json = await r.json().catch(() => null);
      if (!json || typeof json !== "object") throw new Error("BLOCKED: canonical.json could not be parsed");

      const chs = Array.isArray((json as any).chapters) ? ((json as any).chapters as any[]) : [];
      const vm = chs.map((c) => {
        const title = safeStr(c?.title) || "Untitled";
        const sectionCount = Array.isArray(c?.sections) ? c.sections.length : 0;
        return { title, sectionCount };
      });
      setChapters(vm);

      const stats: ContentStats = { verdieping: 0, praktijk: 0, figures: 0 };
      walkJson(json, (obj) => {
        // Canonical format uses `praktijk` / `verdieping` (compiled from skeleton's praktijkHtml/verdiepingHtml).
        // Some draft/legacy shapes may still use `praktijkHtml` / `verdiepingHtml`.
        if (typeof obj?.praktijk === "string" && obj.praktijk.trim()) stats.praktijk += 1;
        if (typeof obj?.verdieping === "string" && obj.verdieping.trim()) stats.verdieping += 1;
        if (typeof obj?.praktijkHtml === "string" && obj.praktijkHtml.trim()) stats.praktijk += 1;
        if (typeof obj?.verdiepingHtml === "string" && obj.verdiepingHtml.trim()) stats.verdieping += 1;

        const t = typeof obj?.type === "string" ? String(obj.type) : "";
        if (t.toLowerCase().includes("figure")) stats.figures += 1;
        if (t === "paragraph" && Array.isArray(obj.images)) stats.figures += obj.images.length;
      });
      setContentStats(stats);

      setCanonicalReady(true);
    } catch (e) {
      setCanonicalError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [mcp, selectedBookId, selectedBookVersionId]);

  const loadJobs = useCallback(async () => {
    const bookId = selectedBookId.trim();
    const bookVersionId = selectedBookVersionId.trim();
    if (!bookId || !bookVersionId) {
      setJobs([]);
      return;
    }
    let res: ListJobsResponse | null = null;
    try {
      res = (await mcp.listJobs({ sinceHours: 72, limit: 200 })) as ListJobsResponse;
    } catch (e) {
      console.warn("[useBookGenMonitor] loadJobs failed:", e);
      return;
    }
    if ((res as any)?.ok !== true) return;

    const all = (res as any).jobs || [];
    const filtered = all.filter((j: AgentJobRow) => {
      const jt = safeStr(j.job_type);
      if (!(jt.startsWith("book_generate_") || jt === "book_normalize_voice")) return false;
      const p = j.payload || {};
      return safeStr(p.bookId) === bookId && safeStr(p.bookVersionId) === bookVersionId;
    });
    setJobs(filtered);

    // Pick an active chapter job to show logs for (prefer in_progress, else queued)
    const chapterJobs = filtered.filter((j) => j.job_type === "book_generate_chapter");
    const voiceJobs = filtered.filter((j) => j.job_type === "book_normalize_voice");

    const inProgress = chapterJobs.find((j) => j.status === "in_progress") || voiceJobs.find((j) => j.status === "in_progress");
    const queued = chapterJobs.find((j) => j.status === "queued") || voiceJobs.find((j) => j.status === "queued");
    const next = inProgress?.id || queued?.id || "";
    setActiveJobId(next);
  }, [mcp, selectedBookId, selectedBookVersionId]);

  const loadEvents = useCallback(async () => {
    const id = activeJobId.trim();
    if (!id) {
      setEvents([]);
      return;
    }
    try {
      const res = (await mcp.callGet("lms.getJob", { id, eventsLimit: "100" })) as GetJobResponse;
      if ((res as any)?.ok !== true) return;
      setEvents(Array.isArray((res as any).events) ? (res as any).events : []);
    } catch (e) {
      console.warn("[useBookGenMonitor] loadEvents failed:", e);
      // Keep previous events; do not crash.
      return;
    }
  }, [mcp, activeJobId]);

  const loadControl = useCallback(async () => {
    const bookId = selectedBookId.trim();
    const bookVersionId = selectedBookVersionId.trim();
    setControl(null);
    setControlError("");
    if (!bookId || !bookVersionId) return;

    try {
      const res = (await mcp.call("lms.bookGenerationControl", {
        bookId,
        bookVersionId,
        action: "get",
      })) as any;
      if (!res || res.ok !== true) {
        const msg = safeStr(res?.error?.message) || "Failed to load BookGen control state";
        setControlError(msg);
        setControl(null);
        return;
      }
      const c = res.control;
      if (!c) {
        setControl(null);
        return;
      }
      setControl({
        paused: c.paused === true,
        cancelled: c.cancelled === true,
        note: typeof c.note === "string" ? c.note : null,
        updated_at: typeof c.updated_at === "string" ? c.updated_at : null,
      });
    } catch (e) {
      setControlError(e instanceof Error ? e.message : String(e));
      setControl(null);
    }
  }, [mcp, selectedBookId, selectedBookVersionId]);

  // Initial book load
  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  // Default selected book (prefer mbo-aandf-4 if present)
  useEffect(() => {
    if (selectedBookId) return;
    if (!books.length) return;
    const preferred = books.find((b) => b.id === "mbo-aandf-4")?.id;
    setSelectedBookId(preferred || books[0].id);
  }, [books, selectedBookId]);

  // Load versions when book changes
  useEffect(() => {
    // Reset version selection when book changes
    setSelectedBookVersionId("");
    void loadVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBookId]);

  // Re-load versions when selection cleared / book stable
  useEffect(() => {
    if (!selectedBookId) return;
    if (selectedBookVersionId) return;
    void loadVersions();
  }, [selectedBookId, selectedBookVersionId, loadVersions]);

  // Load canonical when book+version changes
  useEffect(() => {
    void loadCanonical();
  }, [loadCanonical]);

  // Poll control state
  useEffect(() => {
    void loadControl();
    const t = window.setInterval(() => void loadControl(), 2500);
    return () => window.clearInterval(t);
  }, [loadControl]);

  // Poll jobs periodically
  useEffect(() => {
    if (pollTimer.current) window.clearInterval(pollTimer.current);
    void loadJobs();
    pollTimer.current = window.setInterval(() => void loadJobs(), 2500);
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    };
  }, [loadJobs]);

  // Poll events for active job
  useEffect(() => {
    if (eventsTimer.current) window.clearInterval(eventsTimer.current);
    void loadEvents();
    if (!activeJobId) return;
    eventsTimer.current = window.setInterval(() => void loadEvents(), 2500);
    return () => {
      if (eventsTimer.current) window.clearInterval(eventsTimer.current);
      eventsTimer.current = null;
    };
  }, [activeJobId, loadEvents]);

  const counts = useMemo(() => {
    const by = { queued: 0, in_progress: 0, done: 0, failed: 0 };
    for (const j of jobs) {
      if (j.status === "queued") by.queued += 1;
      else if (j.status === "in_progress") by.in_progress += 1;
      else if (j.status === "done") by.done += 1;
      else if (j.status === "failed" || j.status === "dead_letter") by.failed += 1;
    }
    return by;
  }, [jobs]);

  const sectionStatusMap = useMemo(() => {
    // Latest status per section key (chapterIndex.sectionIndex)
    const map = new Map<string, { status: string; updatedAt: number }>();
    for (const j of jobs) {
      if (j.job_type !== "book_generate_section") continue;
      const p = j.payload || {};
      const ch = safeNum(p.chapterIndex);
      const sec = safeNum(p.sectionIndex);
      if (ch === null || sec === null) continue;
      const key = `${ch}.${sec}`;
      const ts = parseIsoMs(j.completed_at || j.started_at || j.created_at) || 0;
      const prev = map.get(key);
      if (!prev || ts >= prev.updatedAt) map.set(key, { status: j.status, updatedAt: ts });
    }
    return map;
  }, [jobs]);

  const chapterStatusMap = useMemo(() => {
    // Latest status per chapterIndex
    const map = new Map<number, { status: string; updatedAt: number; error?: string | null }>();
    for (const j of jobs) {
      if (j.job_type !== "book_generate_chapter") continue;
      const p = j.payload || {};
      const ch = safeNum(p.chapterIndex);
      if (ch === null) continue;
      const ts = parseIsoMs(j.completed_at || j.started_at || j.created_at) || 0;
      const prev = map.get(ch);
      if (!prev || ts >= prev.updatedAt) map.set(ch, { status: j.status, updatedAt: ts, error: j.error });
    }
    return map;
  }, [jobs]);

  const chapterVms: ChapterVm[] = useMemo(() => {
    const out: ChapterVm[] = [];
    for (let i = 0; i < chapters.length; i += 1) {
      const sectionCount = chapters[i]?.sectionCount ?? 0;
      let doneSections = 0;
      for (let s = 0; s < sectionCount; s += 1) {
        const key = `${i}.${s}`;
        const st = sectionStatusMap.get(key)?.status;
        if (st === "done") doneSections += 1;
      }

      const chJob = chapterStatusMap.get(i);
      const chStatus = safeStr(chJob?.status);
      let status: ChapterStatus = "pending";
      if (chStatus === "failed" || chStatus === "dead_letter") status = "failed";
      else if (chStatus === "in_progress") status = "active";
      else if (chStatus === "queued") status = "queued";
      else if (sectionCount > 0 && doneSections >= sectionCount) status = "done";
      else if (sectionCount === 0) status = "pending";

      out.push({
        index: i,
        title: chapters[i]?.title || `Chapter ${i + 1}`,
        sectionCount,
        doneSections,
        status,
      });
    }
    return out;
  }, [chapters, chapterStatusMap, sectionStatusMap]);

  const totals = useMemo(() => {
    const totalSections = chapterVms.reduce((sum, c) => sum + (c.sectionCount || 0), 0);
    const doneSections = chapterVms.reduce((sum, c) => sum + (c.doneSections || 0), 0);
    const pct = totalSections > 0 ? (doneSections / totalSections) * 100 : 0;
    return { totalSections, doneSections, pct };
  }, [chapterVms]);

  const timing: TimingStats = useMemo(() => {
    const startMs = jobs.length
      ? Math.min(...jobs.map((j) => parseIsoMs(j.started_at || j.created_at) || Date.now()))
      : null;
    const elapsedMs = startMs ? Date.now() - startMs : 0;

    const doneSections = totals.doneSections;
    const totalSections = totals.totalSections;
    const remainingSections = Math.max(0, totalSections - doneSections);

    const msPerSection = doneSections > 0 ? elapsedMs / doneSections : null;
    const remainingMs = msPerSection ? remainingSections * msPerSection : null;

    const eta = (() => {
      if (!remainingMs) return "--:--";
      const d = new Date(Date.now() + remainingMs);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    })();

    return {
      elapsed: startMs ? formatHms(elapsedMs) : "--:--:--",
      remaining: remainingMs ? `~${formatHms(remainingMs)}` : "~--:--:--",
      eta,
      speed: msPerSection ? `${Math.round(msPerSection / 1000)} sec/s` : "-- sec/s",
    };
  }, [jobs, totals.doneSections, totals.totalSections]);

  const monitorStatus: MonitorStatus = useMemo(() => {
    if (control?.cancelled) return "failed";
    if (control?.paused) return "paused";
    if (counts.in_progress > 0 || counts.queued > 0) return "generating";
    if (counts.failed > 0 && counts.done === 0) return "failed";
    if (counts.failed > 0 && counts.done > 0) return "failed";
    if (counts.done > 0) return "completed";
    return "idle";
  }, [control?.cancelled, control?.paused, counts]);

  const recentFailed = useMemo(() => {
    return [...jobs]
      .filter((j) => j.status === "failed" || j.status === "dead_letter")
      .sort((a, b) => safeStr(b.created_at).localeCompare(safeStr(a.created_at)))
      .slice(0, 3);
  }, [jobs]);

  const recentDone = useMemo(() => {
    return [...jobs]
      .filter((j) => j.status === "done")
      .sort((a, b) => safeStr(b.created_at).localeCompare(safeStr(a.created_at)))
      .slice(0, 4);
  }, [jobs]);

  const activeJobs = useMemo(() => {
    return [...jobs]
      .filter((j) => j.status === "queued" || j.status === "in_progress")
      .sort((a, b) => safeStr(b.created_at).localeCompare(safeStr(a.created_at)))
      .slice(0, 3);
  }, [jobs]);

  const latestEventLines = useMemo(() => {
    const lines = [...events]
      .sort((a, b) => safeStr(b.created_at).localeCompare(safeStr(a.created_at)))
      .slice(0, 10)
      .reverse();
    return lines.map((e) => {
      const t = safeStr(e.created_at);
      const time = (() => {
        if (!t) return "";
        const d = new Date(t);
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        const ss = String(d.getSeconds()).padStart(2, "0");
        return `${hh}:${mm}:${ss}`;
      })();
      return {
        time,
        level: safeStr(e.level) || "info",
        message: safeStr(e.message) || "",
      };
    });
  }, [events]);

  return {
    loading,
    books,
    selectedBook,
    selectedBookId,
    setSelectedBookId,
    versions,
    selectedBookVersionId,
    setSelectedBookVersionId,
    chapterCount,
    chapterVms,
    totals,
    counts,
    contentStats,
    timing,
    monitorStatus,
    canonicalReady,
    canonicalError,
    skeletonReady,
    skeletonMeta,
    control,
    controlError,
    activeJobs,
    recentDone,
    recentFailed,
    latestEventLines,
    activeJobId,
  };
}


