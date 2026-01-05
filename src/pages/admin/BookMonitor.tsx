import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { isDevAgentMode } from "@/lib/api/common";
import { useBookGenMonitor } from "@/hooks/useBookGenMonitor";
import { useMCP } from "@/hooks/useMCP";
import { useToast } from "@/hooks/use-toast";
import { HamburgerMenu } from "@/components/layout/HamburgerMenu";
const MONITOR_CSS = String.raw`
:root {
  /* Light theme with subtle accents */
  --bg-primary: #f8fafc;
  --bg-secondary: #ffffff;
  --bg-card: #ffffff;
  --bg-card-hover: #f1f5f9;
  --accent-cyan: #0891b2;
  --accent-purple: #7c3aed;
  --accent-pink: #db2777;
  --accent-orange: #ea580c;
  --success: #059669;
  --success-dim: rgba(5, 150, 105, 0.1);
  --warning: #d97706;
  --warning-dim: rgba(217, 119, 6, 0.1);
  --error: #dc2626;
  --error-dim: rgba(220, 38, 38, 0.08);
  --info: #2563eb;
  --info-dim: rgba(37, 99, 235, 0.08);
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --border: #e2e8f0;
  --border-strong: #cbd5e1;
  --glow-cyan: rgba(8, 145, 178, 0.15);
  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.05);
  --shadow-lg: 0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Space Grotesk', sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  min-height: 100vh;
  background-image:
    radial-gradient(ellipse at 20% 0%, rgba(8, 145, 178, 0.04) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 100%, rgba(124, 58, 237, 0.04) 0%, transparent 50%);
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
}

/* Header */
.header {
  text-align: center;
  margin-bottom: 2rem;
}

.header h1 {
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.header .subtitle {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

/* Grid Layout */
.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1rem;
}

.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-bottom: 1rem;
}

/* Cards */
.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--border-strong);
}

.card-title {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.card-title::before {
  content: '';
  width: 8px;
  height: 8px;
  background: var(--accent-cyan);
  border-radius: 2px;
}

/* Status Badge */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-badge.generating {
  background: var(--info-dim);
  color: var(--info);
  border: 1px solid var(--info);
  animation: pulse 2s infinite;
}

.status-badge.completed {
  background: var(--success-dim);
  color: var(--success);
  border: 1px solid var(--success);
}

.status-badge.paused {
  background: var(--warning-dim);
  color: var(--warning);
  border: 1px solid var(--warning);
}

.status-badge.failed {
  background: var(--error-dim);
  color: var(--error);
  border: 1px solid var(--error);
}

.status-badge::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* Progress Bar */
.progress-container {
  margin-top: 0.5rem;
}

.progress-bar {
  height: 24px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  position: relative;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.06);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-cyan), var(--accent-purple));
  border-radius: 6px;
  transition: width 0.5s ease;
  position: relative;
}

.progress-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.progress-stats {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-family: 'JetBrains Mono', monospace;
}

/* Time Stats */
.time-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.time-stat {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.75rem;
  text-align: center;
  box-shadow: var(--shadow-sm);
}

.time-stat-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
}

.time-stat-value {
  font-size: 1.1rem;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  color: var(--accent-cyan);
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

.stat-box {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem;
  text-align: center;
  border-left: 3px solid transparent;
  transition: all 0.2s;
  box-shadow: var(--shadow-sm);
}

.stat-box:hover {
  background: var(--bg-card-hover);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.stat-box.chapters { border-left-color: var(--accent-cyan); }
.stat-box.sections { border-left-color: var(--accent-purple); }
.stat-box.failed { border-left-color: var(--error); }
.stat-box.queued { border-left-color: var(--warning); }
.stat-box.active { border-left-color: var(--info); }
.stat-box.done { border-left-color: var(--success); }

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  margin-bottom: 0.25rem;
}

.stat-value.cyan { color: var(--accent-cyan); }
.stat-value.purple { color: var(--accent-purple); }
.stat-value.orange { color: var(--accent-orange); }
.stat-value.red { color: var(--error); }
.stat-value.yellow { color: var(--warning); }
.stat-value.blue { color: var(--info); }
.stat-value.green { color: var(--success); }

.stat-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
}

.stat-label::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 2px;
}

.stat-box.chapters .stat-label::before { background: var(--accent-cyan); }
.stat-box.sections .stat-label::before { background: var(--accent-purple); }
.stat-box.failed .stat-label::before { background: var(--error); }
.stat-box.queued .stat-label::before { background: var(--warning); }
.stat-box.active .stat-label::before { background: var(--info); }
.stat-box.done .stat-label::before { background: var(--success); }

/* Active Jobs List */
.job-list {
  max-height: 200px;
  overflow-y: auto;
}

.job-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 0.5rem;
  border-left: 3px solid var(--info);
  font-size: 0.85rem;
  transition: all 0.2s;
  box-shadow: var(--shadow-sm);
}

.job-item:hover {
  background: var(--bg-card-hover);
  transform: translateX(4px);
  box-shadow: var(--shadow-md);
}

.job-item.done { border-left-color: var(--success); }
.job-item.failed { border-left-color: var(--error); }
.job-item.queued { border-left-color: var(--warning); }

.job-type {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0.2rem 0.5rem;
  background: var(--bg-secondary);
  border-radius: 4px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
}

.job-chapter {
  font-family: 'JetBrains Mono', monospace;
  color: var(--accent-cyan);
  font-weight: 600;
  min-width: 50px;
}

.job-title {
  flex: 1;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.job-time {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
}

/* Error Items */
.error-list {
  max-height: 180px;
  overflow-y: auto;
}

.error-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  background: var(--error-dim);
  border-radius: 6px;
  margin-bottom: 0.5rem;
  font-size: 0.8rem;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.error-id {
  font-family: 'JetBrains Mono', monospace;
  color: var(--error);
  font-size: 0.7rem;
  white-space: nowrap;
}

.error-msg {
  color: var(--text-secondary);
  flex: 1;
}

/* Action Buttons */
.actions {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
  margin: 1.5rem 0;
  flex-wrap: wrap;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  box-shadow: var(--shadow-sm);
}

.btn-primary {
  background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple));
  color: white;
  box-shadow: var(--shadow-md);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg), 0 4px 20px var(--glow-cyan);
}

.btn-secondary {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.btn-secondary:hover {
  background: var(--bg-card-hover);
  border-color: var(--accent-cyan);
  box-shadow: var(--shadow-md);
}

.btn-warning {
  background: var(--warning-dim);
  color: var(--warning);
  border: 1px solid var(--warning);
}

.btn-warning:hover {
  background: var(--warning);
  color: var(--bg-primary);
}

.btn-success {
  background: var(--success-dim);
  color: var(--success);
  border: 1px solid var(--success);
}

.btn-success:hover {
  background: var(--success);
  color: var(--bg-primary);
}

.btn-danger {
  background: var(--error-dim);
  color: var(--error);
  border: 1px solid var(--error);
}

.btn-danger:hover {
  background: var(--error);
  color: white;
}

/* Book Selector */
.book-selector {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1rem;
  box-shadow: var(--shadow-sm);
}

.book-selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.book-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.book-cover {
  width: 60px;
  height: 80px;
  background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple));
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}

.book-details h2 {
  font-size: 1.25rem;
  margin-bottom: 0.25rem;
}

.book-details .book-meta {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.book-dropdown {
  padding: 0.5rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: inherit;
  cursor: pointer;
}

.book-selector-controls {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 340px;
}

.version-dropdown {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
}

/* Chapter Progress */
.chapter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 0.5rem;
  margin-top: 1rem;
}

.chapter-cell {
  aspect-ratio: 1;
  background: var(--bg-card);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  font-weight: 600;
  border: 2px solid var(--border);
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: var(--shadow-sm);
}

.chapter-cell:hover {
  transform: scale(1.05);
  box-shadow: var(--shadow-md);
}

.chapter-cell.pending {
  color: var(--text-muted);
  border-color: var(--border);
}

.chapter-cell.done {
  background: var(--success-dim);
  border-color: var(--success);
  color: var(--success);
}

.chapter-cell.active {
  background: var(--info-dim);
  border-color: var(--info);
  color: var(--info);
  animation: pulse 2s infinite;
}

.chapter-cell.queued {
  background: var(--warning-dim);
  border-color: var(--warning);
  color: var(--warning);
}

.chapter-cell.failed {
  background: var(--error-dim);
  border-color: var(--error);
  color: var(--error);
}

.chapter-cell-sections {
  font-size: 0.6rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}

/* Live Logs */
.logs-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.25rem;
  margin-top: 1rem;
  box-shadow: var(--shadow-sm);
}

.logs-container {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem;
  max-height: 250px;
  overflow-y: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  line-height: 1.6;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.05);
}

.log-line {
  margin-bottom: 0.25rem;
}

.log-time {
  color: var(--text-muted);
}

.log-info { color: var(--info); }
.log-success { color: var(--success); }
.log-warning { color: var(--warning); }
.log-error { color: var(--error); }

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: var(--bg-card);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb {
  background: var(--text-muted);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

/* Responsive */
@media (max-width: 900px) {
  .grid-3 { grid-template-columns: 1fr; }
  .grid-2 { grid-template-columns: 1fr; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
}
`;

export default function BookMonitor() {
  const { user, role, loading: authLoading } = useAuth();
  const devAgent = isDevAgentMode();
  const devOverrideRole = typeof window !== "undefined" ? localStorage.getItem("role") : null;
  const monitor = useBookGenMonitor();
  const mcp = useMCP();
  const { toast } = useToast();

  const [selectedChapterIndex, setSelectedChapterIndex] = useState<number>(0);
  const isAdmin = useMemo(
    () =>
      devAgent ||
      role === "admin" ||
      devOverrideRole === "admin" ||
      user?.app_metadata?.role === "admin" ||
      user?.user_metadata?.role === "admin",
    [devAgent, role, devOverrideRole, user?.app_metadata?.role, user?.user_metadata?.role],
  );

  // All hooks MUST be called unconditionally before any early returns.
  useEffect(() => {
    // Inject required fonts + CSS into <head> (keeps body markup pixel-perfect).
    const head = document.head;

    const mkLink = (rel: string, href: string) => {
      const el = document.createElement("link");
      el.rel = rel;
      el.href = href;
      el.dataset.izBookMonitor = "1";
      return el;
    };

    const pre1 = mkLink("preconnect", "https://fonts.googleapis.com");
    const pre2 = mkLink("preconnect", "https://fonts.gstatic.com");
    pre2.crossOrigin = "anonymous";
    const sheet = mkLink(
      "stylesheet",
      "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap",
    );

    const style = document.createElement("style");
    style.dataset.izBookMonitor = "1";
    style.textContent = MONITOR_CSS;

    head.appendChild(pre1);
    head.appendChild(pre2);
    head.appendChild(sheet);
    head.appendChild(style);

    return () => {
      document.querySelectorAll('[data-iz-book-monitor="1"]').forEach((n) => n.remove());
    };
  }, []);

  useEffect(() => {
    // Default to the active chapter, else first non-done chapter.
    const active = monitor.chapterVms.find((c) => c.status === "active")?.index;
    const firstOpen = monitor.chapterVms.find((c) => c.status !== "done")?.index;
    const next = typeof active === "number" ? active : typeof firstOpen === "number" ? firstOpen : 0;
    setSelectedChapterIndex(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitor.selectedBookId, monitor.selectedBookVersionId, monitor.chapterCount]);

  const canRun = useMemo(() => {
    const bookId = monitor.selectedBookId.trim();
    const bookVersionId = monitor.selectedBookVersionId.trim();
    return Boolean(bookId && bookVersionId && monitor.chapterCount > 0);
  }, [monitor.selectedBookId, monitor.selectedBookVersionId, monitor.chapterCount]);

  // Auth guards (after all hooks)
  if (authLoading) {
    // Keep non-invasive while auth resolves (page renders after auth).
    return null;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  // Derived data (after auth guards, before render)
  const bookTitle = monitor.selectedBook?.title || "—";
  const bookLevel = (monitor.selectedBook?.level || "").toString().trim();
  const chapterCount = monitor.chapterCount;
  const versionShort = monitor.selectedBookVersionId ? monitor.selectedBookVersionId.slice(0, 8) : "—";
  const skeletonLabel = monitor.skeletonReady ? "Skeleton v1" : "Legacy";

  const pct = Math.max(0, Math.min(100, Math.round(monitor.totals.pct)));

  const statusBadge = (() => {
    if (monitor.control?.cancelled) return { cls: "failed", label: "Cancelled" };
    if (monitor.monitorStatus === "generating") return { cls: "generating", label: "Generating" };
    if (monitor.monitorStatus === "completed") return { cls: "completed", label: "Completed" };
    if (monitor.monitorStatus === "failed") return { cls: "failed", label: "Failed" };
    if (monitor.monitorStatus === "paused") return { cls: "paused", label: "Paused" };
    return { cls: "paused", label: "Idle" };
  })();

  const doneChapters = monitor.chapterVms.filter((c) => c.status === "done").length;

  const runChapterJob = async (chapterIndex: number) => {
    const bookId = monitor.selectedBookId.trim();
    const bookVersionId = monitor.selectedBookVersionId.trim();
    const levelRaw = (monitor.skeletonMeta?.level || "").toString().trim();
    const level = levelRaw === "n3" || levelRaw === "n4" ? levelRaw : "";
    const language = (monitor.skeletonMeta?.language || "").toString().trim();
    const chapterCount = monitor.chapterCount;
    const title = monitor.selectedBook?.title || "";

    if (!bookId) throw new Error("BLOCKED: bookId is missing");
    if (!bookVersionId) throw new Error("BLOCKED: bookVersionId is missing");
    if (!language) throw new Error("BLOCKED: language is missing for this book/version");
    if (!level) throw new Error("BLOCKED: level is missing for this book");
    if (!title.trim()) throw new Error("BLOCKED: title is missing for this book");
    if (!Number.isFinite(chapterIndex) || chapterIndex < 0) throw new Error("BLOCKED: chapterIndex invalid");
    if (!Number.isFinite(chapterCount) || chapterCount <= 0) throw new Error("BLOCKED: chapterCount is missing");

    // NOTE: The orchestrator requires these knobs; we keep defaults consistent with Book Studio.
    const payload: Record<string, unknown> = {
      bookId,
      bookVersionId,
      chapterIndex,
      chapterCount,
      topic: title.trim(),
      language,
      level,
      writeModel: "anthropic:claude-sonnet-4-5",
    };

    const res = await mcp.enqueueJob("book_generate_chapter", payload);
    if (!res?.ok || !res.jobId) throw new Error(res?.error || "Failed to enqueue chapter job");
    return res.jobId;
  };

  const onGenerateChapter = async () => {
    if (!canRun) {
      toast({ title: "BLOCKED", description: "Select a book + version first.", variant: "destructive" });
      return;
    }
    if (monitor.monitorStatus === "generating") {
      toast({ title: "Already running", description: "Generation is already in progress." });
      return;
    }
    try {
      const jobId = await runChapterJob(selectedChapterIndex);
      toast({ title: "Queued", description: `Chapter job queued (${jobId.slice(0, 8)})` });
    } catch (e) {
      toast({ title: "Generate failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  };

  const onGenerateAll = async () => {
    if (!canRun) {
      toast({ title: "BLOCKED", description: "Select a book + version first.", variant: "destructive" });
      return;
    }
    if (monitor.monitorStatus === "generating") {
      toast({ title: "Already running", description: "Generation is already in progress." });
      return;
    }
    try {
      const firstOpen = monitor.chapterVms.find((c) => c.sectionCount > 0 && c.doneSections < c.sectionCount)?.index;
      if (typeof firstOpen !== "number") {
        toast({ title: "Done", description: "All chapters appear complete." });
        return;
      }
      const jobId = await runChapterJob(firstOpen);
      toast({ title: "Queued", description: `BookGen resumed at Ch${firstOpen + 1} (${jobId.slice(0, 8)})` });
    } catch (e) {
      toast({ title: "Generate failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  };

  const onPause = async () => {
    const bookId = monitor.selectedBookId.trim();
    const bookVersionId = monitor.selectedBookVersionId.trim();
    if (!bookId || !bookVersionId) {
      toast({ title: "BLOCKED", description: "Select a book + version first.", variant: "destructive" });
      return;
    }
    try {
      const res = (await mcp.call("lms.bookGenerationControl", { bookId, bookVersionId, action: "pause" })) as any;
      if (!res || res.ok !== true) throw new Error(res?.error?.message || "Pause failed");
      toast({ title: "Paused", description: "Will stop after the current chapter completes." });
    } catch (e) {
      toast({ title: "Pause failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  };

  const onResume = async () => {
    const bookId = monitor.selectedBookId.trim();
    const bookVersionId = monitor.selectedBookVersionId.trim();
    if (!bookId || !bookVersionId) {
      toast({ title: "BLOCKED", description: "Select a book + version first.", variant: "destructive" });
      return;
    }
    try {
      const res = (await mcp.call("lms.bookGenerationControl", { bookId, bookVersionId, action: "resume" })) as any;
      if (!res || res.ok !== true) throw new Error(res?.error?.message || "Resume failed");
      toast({ title: "Resumed", description: "Pause flag cleared." });
      if (monitor.monitorStatus !== "generating") {
        await onGenerateAll();
      }
    } catch (e) {
      toast({ title: "Resume failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  };

  const onCancel = async () => {
    const bookId = monitor.selectedBookId.trim();
    const bookVersionId = monitor.selectedBookVersionId.trim();
    if (!bookId || !bookVersionId) {
      toast({ title: "BLOCKED", description: "Select a book + version first.", variant: "destructive" });
      return;
    }
    try {
      const res = (await mcp.call("lms.bookGenerationControl", { bookId, bookVersionId, action: "cancel" })) as any;
      if (!res || res.ok !== true) throw new Error(res?.error?.message || "Cancel failed");
      toast({ title: "Cancelled", description: "Will stop after the current chapter completes." });
    } catch (e) {
      toast({ title: "Cancel failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  };

  const onRenderPdf = async () => {
    const bookId = monitor.selectedBookId.trim();
    const bookVersionId = monitor.selectedBookVersionId.trim();
    if (!bookId || !bookVersionId) {
      toast({ title: "BLOCKED", description: "Select a book + version first.", variant: "destructive" });
      return;
    }
    try {
      const res = (await mcp.call("lms.bookEnqueueRender", {
        bookId,
        bookVersionId,
        target: "chapter",
        chapterIndex: selectedChapterIndex,
        pipelineMode: "render_only",
        allowMissingImages: true,
      })) as any;
      if (!res || res.ok !== true) throw new Error(res?.error?.message || "Render enqueue failed");
      toast({ title: "Queued", description: `Render job queued (runId ${String(res.runId || "").slice(0, 8)})` });
    } catch (e) {
      toast({ title: "Render failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  };

  return (
    <>
      <div className="container">
        <header className="header" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, right: 0 }}>
            <HamburgerMenu />
          </div>
          <h1>📚 Book Generation Monitor</h1>
          <p className="subtitle">Skeleton → Content → PDF Pipeline</p>
        </header>

        <div className="book-selector">
          <div className="book-selector-header">
            <div className="book-info">
              <div className="book-cover">📖</div>
              <div className="book-details">
                <h2>{bookTitle}</h2>
                <div className="book-meta">
                  {chapterCount} chapters • Version: {versionShort} • {skeletonLabel}
                  {bookLevel ? ` • Level: ${bookLevel.toUpperCase()}` : ""}
                </div>
              </div>
            </div>
            <div className="book-selector-controls">
              <select
                className="book-dropdown"
                data-cta-id="cta-bookmonitor-book-select"
                data-action="action"
                value={monitor.selectedBookId}
                onChange={(e) => monitor.setSelectedBookId(e.target.value)}
              >
                {(monitor.books.length ? monitor.books : [{ id: "", title: "Loading…" }]).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>

              <select
                className="book-dropdown version-dropdown"
                data-cta-id="cta-bookmonitor-version-select"
                data-action="action"
                value={monitor.selectedBookVersionId}
                onChange={(e) => monitor.setSelectedBookVersionId(e.target.value)}
              >
                {(monitor.versions.length ? monitor.versions : [{ book_version_id: "", exported_at: "", status: "" } as any]).map((v: any) => {
                  const id = typeof v?.book_version_id === "string" ? v.book_version_id : "";
                  const short = id ? (id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id.slice(0, 8)) : "—";
                  const exported = typeof v?.exported_at === "string" && v.exported_at ? v.exported_at.slice(0, 10) : "—";
                  const status = typeof v?.status === "string" && v.status ? v.status : "";
                  const label = `${exported} · ${short}${status ? ` · ${status}` : ""}`;
                  return (
                    <option key={id || label} value={id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="chapter-grid">
            {monitor.chapterVms.map((c) => (
              <div
                key={c.index}
                className={`chapter-cell ${c.status}`}
                data-cta-id="cta-bookmonitor-chapter-cell"
                data-action="action"
                data-payload-chapter={String(c.index + 1)}
                onClick={() => setSelectedChapterIndex(c.index)}
              >
                Ch{c.index + 1}
                <span className="chapter-cell-sections">
                  {c.doneSections}/{c.sectionCount}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid-3">
          <div className="card">
            <div className="card-title">Status</div>
            <div className={`status-badge ${statusBadge.cls}`}>{statusBadge.label}</div>
          </div>

          <div className="card">
            <div className="card-title">Progress</div>
            <div className="progress-container">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="progress-stats">
                <span>{pct}%</span>
                <span>
                  {monitor.totals.doneSections} / {monitor.totals.totalSections} sections
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">⏱️ Time</div>
            <div className="time-grid">
              <div className="time-stat">
                <div className="time-stat-label">Elapsed</div>
                <div className="time-stat-value">{monitor.timing.elapsed}</div>
              </div>
              <div className="time-stat">
                <div className="time-stat-label">Remaining</div>
                <div className="time-stat-value">{monitor.timing.remaining}</div>
              </div>
              <div className="time-stat">
                <div className="time-stat-label">ETA</div>
                <div className="time-stat-value">{monitor.timing.eta}</div>
              </div>
              <div className="time-stat">
                <div className="time-stat-label">Speed</div>
                <div className="time-stat-value">{monitor.timing.speed}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid-3">
          <div className="card">
            <div className="card-title">Job Queue</div>
            <div className="stats-grid">
              <div className="stat-box queued">
                <div className="stat-value yellow">{monitor.counts.queued}</div>
                <div className="stat-label">Queued</div>
              </div>
              <div className="stat-box active">
                <div className="stat-value blue">{monitor.counts.in_progress}</div>
                <div className="stat-label">Active</div>
              </div>
              <div className="stat-box done">
                <div className="stat-value green">{monitor.counts.done}</div>
                <div className="stat-label">Done</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">🔄 Active Jobs</div>
            <div className="job-list">
              {monitor.activeJobs.length ? (
                monitor.activeJobs.map((j) => {
                  const p = j.payload || {};
                  const ch = typeof p.chapterIndex === "number" ? p.chapterIndex : null;
                  const sec = typeof p.sectionIndex === "number" ? p.sectionIndex : null;
                  const type = j.job_type === "book_generate_section" ? "section" : j.job_type === "book_generate_chapter" ? "chapter" : j.job_type;
                  const chapterLabel =
                    ch === null
                      ? "—"
                      : sec === null
                        ? `Ch${ch + 1}`
                        : `Ch${ch + 1}.${sec + 1}`;
                  const title =
                    typeof ch === "number" && monitor.chapterVms[ch]?.title
                      ? monitor.chapterVms[ch].title.replace(/^\d+\.\s*/, "")
                      : bookTitle;
                  const startedAt = typeof j.started_at === "string" ? Date.parse(j.started_at) : NaN;
                  const ageS = Number.isFinite(startedAt) ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : null;
                  const time = j.status === "queued" ? "queued" : typeof ageS === "number" ? `${ageS}s` : "—";
                  const cls = `job-item${j.status === "queued" ? " queued" : ""}`;
                  return (
                    <div key={j.id} className={cls}>
                      <span className="job-type">{type}</span>
                      <span className="job-chapter">{chapterLabel}</span>
                      <span className="job-title">{title}</span>
                      <span className="job-time">{time}</span>
                    </div>
                  );
                })
              ) : (
                <div className="job-item">
                  <span className="job-type">idle</span>
                  <span className="job-chapter">—</span>
                  <span className="job-title">No active jobs</span>
                  <span className="job-time">—</span>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">⚠️ Recent Errors</div>
            <div className="error-list">
              {monitor.recentFailed.length ? (
                monitor.recentFailed.map((j) => {
                  const p = j.payload || {};
                  const ch = typeof p.chapterIndex === "number" ? p.chapterIndex + 1 : null;
                  const sec = typeof p.sectionIndex === "number" ? p.sectionIndex + 1 : null;
                  const tag = ch ? `[Ch${ch}${sec ? `.${sec}` : ""}]` : `[${j.id.slice(0, 8)}]`;
                  const msg = (j.error || "").trim() || "Job failed";
                  return (
                    <div key={j.id} className="error-item">
                      <span className="error-id">{tag}</span>
                      <span className="error-msg">{msg}</span>
                    </div>
                  );
                })
              ) : (
                <div className="error-item">
                  <span className="error-id">[OK]</span>
                  <span className="error-msg">No recent failures</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="actions">
          <button
            className="btn btn-primary"
            data-cta-id="cta-generate-chapter"
            data-action="enqueueJob"
            data-job-type="book_generate_chapter"
            type="button"
            onClick={() => void onGenerateChapter()}
          >
            ▶️ Generate Chapter
          </button>
          <button
            className="btn btn-secondary"
            data-cta-id="cta-generate-all"
            data-action="enqueueJob"
            data-job-type="book_generate_chapter"
            type="button"
            onClick={() => void onGenerateAll()}
          >
            📚 Generate All
          </button>
          <button className="btn btn-warning" data-cta-id="cta-pause" data-action="action" type="button" onClick={() => void onPause()}>
            ⏸️ Pause
          </button>
          <button className="btn btn-success" data-cta-id="cta-resume" data-action="action" type="button" onClick={() => void onResume()}>
            ▶️ Resume
          </button>
          <button className="btn btn-danger" data-cta-id="cta-cancel" data-action="action" type="button" onClick={() => void onCancel()}>
            ⏹️ Cancel
          </button>
          <button className="btn btn-secondary" data-cta-id="cta-render-pdf" data-action="action" type="button" onClick={() => void onRenderPdf()}>
            📄 Render PDF
          </button>
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-title">Content Generated</div>
            <div className="stats-grid">
              <div className="stat-box chapters">
                <div className="stat-value cyan">{doneChapters}</div>
                <div className="stat-label">Chapters</div>
              </div>
              <div className="stat-box sections">
                <div className="stat-value purple">{monitor.totals.doneSections}</div>
                <div className="stat-label">Sections</div>
              </div>
              <div className="stat-box failed">
                <div className="stat-value red">{monitor.counts.failed}</div>
                <div className="stat-label">Failed</div>
              </div>
            </div>
            <div className="stats-grid" style={{ marginTop: "0.75rem" }}>
              <div className="stat-box">
                <div className="stat-value cyan">{monitor.contentStats.verdieping}</div>
                <div className="stat-label">Verdieping</div>
              </div>
              <div className="stat-box">
                <div className="stat-value purple">{monitor.contentStats.praktijk}</div>
                <div className="stat-label">Praktijk</div>
              </div>
              <div className="stat-box">
                <div className="stat-value orange">{monitor.contentStats.figures}</div>
                <div className="stat-label">Figures</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">✅ Recently Completed</div>
            <div className="job-list">
              {monitor.recentDone.length ? (
                monitor.recentDone.map((j) => {
                  const p = j.payload || {};
                  const ch = typeof p.chapterIndex === "number" ? p.chapterIndex : null;
                  const sec = typeof p.sectionIndex === "number" ? p.sectionIndex : null;
                  const type = j.job_type === "book_generate_section" ? "section" : j.job_type === "book_generate_chapter" ? "chapter" : j.job_type;
                  const chapterLabel =
                    ch === null
                      ? "—"
                      : sec === null
                        ? `Ch${ch + 1}`
                        : `Ch${ch + 1}.${sec + 1}`;
                  const title =
                    typeof ch === "number" && monitor.chapterVms[ch]?.title
                      ? monitor.chapterVms[ch].title.replace(/^\d+\.\s*/, "")
                      : bookTitle;
                  const completedAt = typeof j.completed_at === "string" ? Date.parse(j.completed_at) : NaN;
                  const ageS = Number.isFinite(completedAt) ? Math.max(0, Math.floor((Date.now() - completedAt) / 1000)) : null;
                  const time =
                    typeof ageS === "number"
                      ? ageS < 60
                        ? `${ageS}s ago`
                        : ageS < 3600
                          ? `${Math.floor(ageS / 60)}m ago`
                          : `${Math.floor(ageS / 3600)}h ago`
                      : "—";
                  return (
                    <div key={j.id} className="job-item done">
                      <span className="job-type">{type}</span>
                      <span className="job-chapter">{chapterLabel}</span>
                      <span className="job-title">{title}</span>
                      <span className="job-time">{time}</span>
                    </div>
                  );
                })
              ) : (
                <div className="job-item done">
                  <span className="job-type">—</span>
                  <span className="job-chapter">—</span>
                  <span className="job-title">No completed jobs yet</span>
                  <span className="job-time">—</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="logs-card">
          <div className="card-title">Live Logs</div>
          <div className="logs-container">
            {monitor.latestEventLines.length ? (
              monitor.latestEventLines.map((l, idx) => {
                const lv = l.level.toLowerCase();
                const cls =
                  lv.includes("error") || lv.includes("fail")
                    ? "log-error"
                    : lv.includes("warn")
                      ? "log-warning"
                      : lv.includes("done") || lv.includes("success")
                        ? "log-success"
                        : "log-info";
                const icon = cls === "log-error" ? "❌" : cls === "log-warning" ? "⚠️" : cls === "log-success" ? "✅" : "ℹ️";
                const time = l.time ? `[${l.time}]` : "";
                return (
                  <div key={idx} className="log-line">
                    <span className="log-time">{time}</span> <span className={cls}>{icon}</span> {l.message}
                  </div>
                );
              })
            ) : (
              <div className="log-line">
                <span className="log-time">[--:--:--]</span> <span className="log-info">ℹ️</span>{" "}
                {monitor.canonicalError
                  ? monitor.canonicalError
                  : monitor.controlError
                    ? monitor.controlError
                    : "No live logs yet"}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}


