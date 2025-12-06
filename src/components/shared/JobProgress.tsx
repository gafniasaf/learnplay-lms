import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";

interface JobProgressEvent {
  type: string;
  event?: { step?: string; progress?: number; message?: string };
}

interface JobProgressProps {
  supabaseUrl?: string;
  jobId: string;
  onDone?: (finalStatus: "done" | "failed" | "needs_attention") => void;
}

export const JobProgress = ({ supabaseUrl, jobId, onDone }: JobProgressProps) => {
  const [_events, setEvents] = useState<JobProgressEvent[]>([]);
  const [percent, setPercent] = useState<number>(0);
  const [status, setStatus] = useState<string>("starting");
  const [final, setFinal] = useState<null | "done" | "failed" | "needs_attention">(null);

  useEffect(() => {
    if (!jobId) return;
    const runtimeUrl =
      supabaseUrl ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (typeof window !== "undefined" ? ((window as any).__SUPABASE_URL as string | undefined) : undefined) ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((typeof process !== "undefined" ? (process as any).env?.VITE_SUPABASE_URL : undefined) as string | undefined) ||
      "";
    const base = String(runtimeUrl).replace(/\/$/, "");
    const url = `${base}/functions/v1/job-events-stream?jobId=${encodeURIComponent(jobId)}`;
    const es = new EventSource(url, { withCredentials: false });

    es.onmessage = (e) => {
      try {
        const data: JobProgressEvent = JSON.parse(e.data);
        setEvents((prev) => [...prev, data]);
        const step = (data.event?.step || data.type || "").toString();
        setStatus(step || "working");

        if (typeof data.event?.progress === "number") {
          setPercent(data.event.progress);
        }

        if (step === "done" || step === "failed" || step === "needs_attention") {
          const fs = step as "done" | "failed" | "needs_attention";
          setFinal(fs);
          try {
            onDone?.(fs);
          } catch (err) {
            logger.error("JobProgress onDone callback failed", err instanceof Error ? err : new Error(String(err)), {
              jobId,
            });
          }
          setPercent(100);
          es.close();
        }
      } catch {
        logger.warn("JobProgress failed to parse SSE message", {
          jobId,
          raw: e.data,
        });
      }
    };
    es.onerror = (err) => {
      logger.warn("JobProgress SSE error", {
        jobId,
        error: String(err),
      });
      es.close();
    };
    return () => es.close();
  }, [jobId, supabaseUrl, onDone]);

  const borderClass =
    final === "done"
      ? "border-green-500"
      : final === "failed"
      ? "border-red-500"
      : "border-border";

  return (
    <div className={`ml-3 inline-flex items-center gap-2 text-sm px-2 py-1 rounded border ${borderClass} bg-card`}>
      <span className="font-medium">Job {jobId.slice(0, 8)}…</span>
      <span className="text-muted-foreground">{status}</span>
      <span className="text-muted-foreground">{percent}%</span>
    </div>
  );
};

