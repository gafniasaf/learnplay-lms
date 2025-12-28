import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";
import { isDevAgentMode, callEdgeFunction, callEdgeFunctionGet } from "@/lib/api/common";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronDown, Loader2, Sparkles } from "lucide-react";
import type { Course, StudyText } from "@/lib/types/course";
import { uploadMediaFile } from "@/lib/api/media";
import { mergeExpertcollegeGeneratedExercises } from "@/pages/admin/expertcollege/mergeExpertcollegeGeneratedExercises";

type ScopeMode = "single" | "selected" | "course";
type PageMode = "select" | "generating" | "review";
type RunStatus = "queued" | "running" | "done" | "failed";

type GenerationRun = {
  studyTextId: string; // original target course studyText id
  studyTextTitle: string;
  tempCourseId: string;
  jobId: string;
  status: RunStatus;
  error?: string;
  generated?: {
    course: any;
    items: any[];
  };
};

function sanitizeIdFragment(v: string, maxLen: number): string {
  return String(v || "")
    .trim()
    .toLowerCase()
    // Course ids are constrained by `idStr` (a-z0-9- only, max 64 chars)
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, Math.max(1, Math.floor(maxLen)));
}

function makeTempCourseId(args: { courseId: string; studyTextId: string; index: number }): string {
  const prefix = "ecgen";
  // Compact, url-safe entropy to avoid collisions while staying under 64 chars
  const tail = `${Date.now().toString(36)}${Math.max(0, args.index).toString(36)}`;
  const maxLen = 64;

  // prefix-course-study-tail => 3 separators
  const remaining = maxLen - (prefix.length + tail.length + 3);
  const coursePartMax = Math.max(8, Math.floor(remaining * 0.6));
  const studyPartMax = Math.max(6, remaining - coursePartMax);

  const coursePart = sanitizeIdFragment(args.courseId, coursePartMax) || "course";
  const studyPart = sanitizeIdFragment(args.studyTextId, studyPartMax) || "study";

  const raw = `${prefix}-${coursePart}-${studyPart}-${tail}`.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (raw.length <= maxLen) return raw;
  return raw.slice(0, maxLen).replace(/-+$/g, "");
}

function stripHtml(s: string): string {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function sortStudyTexts(sts: StudyText[]): StudyText[] {
  return sts
    .slice()
    .sort((a, b) => (Number(a.order ?? 0) - Number(b.order ?? 0)) || String(a.title || "").localeCompare(String(b.title || "")));
}

export default function ExpertcollegeExerciseGenerationEditor() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const mcp = useMCP();
  const { user, role } = useAuth();

  // Admin guard (match CourseSelector behavior)
  const devOverrideRole = typeof window !== "undefined" ? localStorage.getItem("role") : null;
  const devAgent = isDevAgentMode();
  const isAdmin =
    devAgent ||
    role === "admin" ||
    devOverrideRole === "admin" ||
    user?.app_metadata?.role === "admin" ||
    user?.user_metadata?.role === "admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [course, setCourse] = useState<Course | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pageMode, setPageMode] = useState<PageMode>("select");
  const [scopeMode, setScopeMode] = useState<ScopeMode>("single");
  const [selectedStudyTextIds, setSelectedStudyTextIds] = useState<Set<string>>(new Set());
  const [subjectOverride, setSubjectOverride] = useState<string>("");
  const [audienceOverride, setAudienceOverride] = useState<string>("");

  const [runs, setRuns] = useState<GenerationRun[]>([]);
  const runsRef = useRef<GenerationRun[]>([]);
  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(new Set());
  const [expandedStudyTextIds, setExpandedStudyTextIds] = useState<Set<string>>(new Set());

  const studyTexts = useMemo(() => {
    const sts = Array.isArray((course as any)?.studyTexts) ? ((course as any).studyTexts as StudyText[]) : [];
    return sortStudyTexts(sts);
  }, [course]);

  const effectiveSubject = useMemo(() => {
    const v = subjectOverride.trim();
    if (v) return v;
    return String((course as any)?.subject || course?.title || "").trim() || "Expertcollege";
  }, [subjectOverride, course]);

  const effectiveAudience = useMemo(() => {
    const v = audienceOverride.trim();
    if (v) return v;
    return String((course as any)?.gradeBand || (course as any)?.grade || "").trim() || "HBO";
  }, [audienceOverride, course]);

  const stats = useMemo(() => {
    const total = runs.length;
    const done = runs.filter((r) => r.status === "done").length;
    const failed = runs.filter((r) => r.status === "failed").length;
    return { total, done, failed };
  }, [runs]);

  const loadCourse = useCallback(async () => {
    if (!courseId) {
      setError("Missing courseId in URL");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const c = (await mcp.getCourse(courseId)) as any;
      setCourse(c as Course);

      // Default selection: first study text (single mode)
      const sts = Array.isArray((c as any)?.studyTexts) ? ((c as any).studyTexts as StudyText[]) : [];
      const first = sts?.[0]?.id ? String(sts[0].id) : null;
      if (first) {
        setSelectedStudyTextIds(new Set([first]));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load course");
      setCourse(null);
    } finally {
      setLoading(false);
    }
  }, [courseId, mcp]);

  useEffect(() => {
    if (!isAdmin) {
      navigate("/admin");
      return;
    }
    void loadCourse();
  }, [isAdmin, navigate, loadCourse]);

  // Scope selection helpers
  const toggleStudyText = (id: string) => {
    setSelectedStudyTextIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleStudyTextExpand = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation(); // prevent selecting when expanding
    setExpandedStudyTextIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyScopeMode = (mode: ScopeMode) => {
    setScopeMode(mode);
    if (mode === "course") {
      setSelectedStudyTextIds(new Set(studyTexts.map((st) => String(st.id))));
      return;
    }
    if (mode === "single") {
      const first = studyTexts?.[0]?.id ? String(studyTexts[0].id) : null;
      setSelectedStudyTextIds(first ? new Set([first]) : new Set());
      return;
    }
    // selected: keep current selection
  };

  // Generation
  const startGeneration = async () => {
    if (!courseId || !course) return;
    if (studyTexts.length === 0) {
      toast.error("BLOCKED: This course has no study texts. Add study texts first.");
      return;
    }
    const ids = Array.from(selectedStudyTextIds);
    if (ids.length === 0) {
      toast.error("Select at least one study text");
      return;
    }

    const byId = new Map<string, StudyText>();
    studyTexts.forEach((st) => byId.set(String(st.id), st));

    toast.info(`Enqueuing ${ids.length} generation job(s)…`);
    setPageMode("generating");
    setRuns([]);
    setSelectedItemKeys(new Set());
    setExpandedKeys(new Set());

    const newRuns: GenerationRun[] = [];
    for (let i = 0; i < ids.length; i++) {
      const stId = ids[i];
      const st = byId.get(stId);
      if (!st) continue;
      const studyText = String((st as any).content || "").trim();
      if (!studyText) {
        newRuns.push({
          studyTextId: stId,
          studyTextTitle: String((st as any).title || "Untitled study text"),
          tempCourseId: "",
          jobId: "",
          status: "failed",
          error: "Study text content is empty",
        });
        continue;
      }

      const tempCourseId = makeTempCourseId({ courseId, studyTextId: stId, index: i });

      try {
        const resp = await mcp.enqueueJob("ai_course_generate", {
          course_id: tempCourseId,
          subject: effectiveSubject,
          grade_band: effectiveAudience,
          grade: effectiveAudience,
          items_per_group: 3,
          mode: "options",
          protocol: "ec-expert",
          notes: `Expertcollege exercise generation editor run (sourceCourse=${courseId}, studyTextId=${stId})`,
          study_text: studyText,
        });

        if (!resp?.ok || !resp.jobId) {
          throw new Error(resp?.error || "enqueue-job failed");
        }

        newRuns.push({
          studyTextId: stId,
          studyTextTitle: String((st as any).title || "Untitled study text"),
          tempCourseId,
          jobId: String(resp.jobId),
          status: "queued",
        });
      } catch (e) {
        newRuns.push({
          studyTextId: stId,
          studyTextTitle: String((st as any).title || "Untitled study text"),
          tempCourseId,
          jobId: "",
          status: "failed",
          error: e instanceof Error ? e.message : "enqueue failed",
        });
      }
    }

    setRuns(newRuns);
  };

  const pollRuns = useCallback(async () => {
    const current = runsRef.current;
    if (current.length === 0) return;
    const pending = current.filter((r) => r.status === "queued" || r.status === "running");
    if (pending.length === 0) return;

    const updates: GenerationRun[] = [...current];

    for (let i = 0; i < updates.length; i++) {
      const r = updates[i];
      if (r.status !== "queued" && r.status !== "running") continue;
      if (!r.jobId) continue;

      try {
        // Preview/dev-agent mode: actively drive the worker so generation progresses without cron.
        // process-pending-jobs requires x-agent-token, so we only attempt it in dev-agent mode.
        if (devAgent) {
          try {
            await callEdgeFunctionGet<any>(
              "process-pending-jobs",
              { jobId: r.jobId, mediaN: "0" },
              { timeoutMs: 120_000, maxRetries: 0 }
            );
          } catch {
            // Best-effort only; polling job status will continue.
          }
        }

        const resp = (await mcp.getCourseJob(r.jobId, false)) as any;
        // Transient network payloads return ok:false but should be retried.
        if (resp?.ok === false && resp?.error?.code === "transient_network") {
          continue;
        }

        const job = resp?.job as any;
        if (!job) continue;
        const status = String(job.status || "");

        if (status === "failed") {
          updates[i] = {
            ...r,
            status: "failed",
            error: String(job.error || job.result?.error || "Job failed"),
          };
          continue;
        }

        if (status === "done") {
          if (!r.generated) {
            const generatedCourseId = String(job.course_id || r.tempCourseId);
            const gen = (await mcp.getCourse(generatedCourseId)) as any;
            const items = Array.isArray((gen as any)?.items) ? ((gen as any).items as any[]) : [];
            updates[i] = { ...r, status: "done", generated: { course: gen, items } };

            // Default: select all items from this generated course
            setSelectedItemKeys((prev) => {
              const next = new Set(prev);
              for (const it of items) {
                const key = `${generatedCourseId}:${String(it?.id ?? "")}`;
                next.add(key);
              }
              return next;
            });
          } else {
            updates[i] = { ...r, status: "done" };
          }
          continue;
        }

        // pending/processing/running
        updates[i] = { ...r, status: "running" };
      } catch (e) {
        // Best-effort; keep polling
        continue;
      }
    }

    setRuns(updates);
  }, [mcp, devAgent]);

  useEffect(() => {
    if (pageMode !== "generating") return;
    const timer = setInterval(() => {
      void pollRuns();
    }, 3000);
    return () => clearInterval(timer);
  }, [pageMode, pollRuns]);

  useEffect(() => {
    if (pageMode !== "generating") return;
    if (runs.length === 0) return;
    const allTerminal = runs.every((r) => r.status === "done" || r.status === "failed");
    if (allTerminal) {
      setPageMode("review");
      toast.success("Generation complete. Review the exercises below.");
    }
  }, [pageMode, runs]);

  // Review helpers
  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectedItem = (key: string) => {
    setSelectedItemKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setItemField = (runIdx: number, itemIdx: number, updater: (item: any) => any) => {
    setRuns((prev) => {
      const next = prev.map((r) => ({ ...r })) as GenerationRun[];
      const run = next[runIdx];
      const items = run.generated?.items ? [...run.generated.items] : null;
      if (!run.generated || !items || !items[itemIdx]) return prev;
      items[itemIdx] = updater(items[itemIdx]);
      run.generated = { ...run.generated, items };
      next[runIdx] = run;
      return next;
    });
  };

  // AI actions (rewrite / image / upload) — use same icon language as CourseEditorV3 (✨ 🎨 🖼️)
  const aiRewriteStem = async (runIdx: number, itemIdx: number) => {
    const run = runs[runIdx];
    const item = run?.generated?.items?.[itemIdx];
    if (!course || !run || !item) return;
    const stemText = String(item.text || item.stem?.text || "");
    if (!stemText.trim()) {
      toast.error("No stem text to rewrite");
      return;
    }
    try {
      toast.info("Generating AI rewrite…");
      const options = Array.isArray(item.options) ? item.options.map(String) : [];
      const result = await mcp.rewriteText({
        segmentType: "stem",
        currentText: stemText,
        context: {
          subject: effectiveSubject,
          difficulty: "intermediate",
          mode: item.mode || "options",
          options,
          correctIndex: typeof item.correctIndex === "number" ? item.correctIndex : -1,
          guidance: "Rewrite the question clearly without changing its meaning. Output HTML only.",
          course: { id: course.id, title: course.title, description: course.description },
        },
        candidateCount: 1,
      });
      if (result?.candidates?.[0]?.text) {
        setItemField(runIdx, itemIdx, (it) => ({ ...it, text: result.candidates[0].text }));
        toast.success("AI rewrite applied");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI rewrite failed");
    }
  };

  const aiGenerateStemImage = async (runIdx: number, itemIdx: number) => {
    const run = runs[runIdx];
    const item = run?.generated?.items?.[itemIdx];
    if (!course || !run || !item) return;
    const stemText = String(item.text || item.stem?.text || "");
    if (!stemText.trim()) {
      toast.error("No stem text yet");
      return;
    }
    try {
      toast.info("Generating image for stem…");
      const stemPlain = stripHtml(stemText).slice(0, 180);
      const options = Array.isArray(item.options) ? item.options.map(String).slice(0, 4) : [];
      const optionsContext = options.length ? `Answer choices include: ${options.map((o) => stripHtml(o)).join(", ")}.` : "";
      const prompt = [
        `Educational visual for ${effectiveSubject}.`,
        `Question context: ${stemPlain}`,
        optionsContext,
        `Create a clean photo or realistic illustration that supports the question.`,
        `IMPORTANT: Absolutely no text, letters, words, labels, numbers, or written language anywhere in the image.`,
        `No charts or infographics. No copyrighted characters or brands.`,
        `Wide aspect ratio (16:9) suitable for a question stem.`,
      ]
        .filter(Boolean)
        .join(" ");

      const res = (await callEdgeFunction<any, any>("ai-generate-media", {
        prompt,
        kind: "image",
        options: { aspectRatio: "16:9", size: "1024x1024", quality: "standard" },
      })) as any;

      if (!res?.url) throw new Error("AI media generation returned no url");

      setItemField(runIdx, itemIdx, (it) => {
        const next = { ...(it as any) };
        const existing = Array.isArray(next?.stimulus?.media) ? [...next.stimulus.media] : [];
        existing.push({
          id: crypto.randomUUID(),
          type: "image",
          url: res.url,
          alt: res.alt || "Stem image",
        });
        next.stimulus = { ...(next.stimulus || {}), media: existing };
        return next;
      });
      toast.success("Stem image added (remember to Save at the end)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI image generation failed");
    }
  };

  const uploadStemImage = (runIdx: number, itemIdx: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        toast.info("Uploading image…");
        const path = `temp/${Date.now()}-${file.name}`;
        const uploadRes = await uploadMediaFile(path, file, "courses");
        if (!uploadRes?.ok || !uploadRes?.url) throw new Error("Upload failed");
        setItemField(runIdx, itemIdx, (it) => {
          const next = { ...(it as any) };
          const existing = Array.isArray(next?.stimulus?.media) ? [...next.stimulus.media] : [];
          existing.push({
            id: crypto.randomUUID(),
            type: "image",
            url: uploadRes.url,
            alt: file.name,
          });
          next.stimulus = { ...(next.stimulus || {}), media: existing };
          return next;
        });
        toast.success("Uploaded");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
    };
    input.click();
  };

  const aiRewriteOption = async (runIdx: number, itemIdx: number, optionIdx: number) => {
    const run = runs[runIdx];
    const item = run?.generated?.items?.[itemIdx];
    if (!course || !run || !item) return;
    const options = Array.isArray(item.options) ? item.options.map(String) : [];
    const currentText = String(options[optionIdx] || "");
    if (!currentText.trim()) {
      toast.error("No option text to rewrite");
      return;
    }
    try {
      toast.info(`Rewriting option ${optionIdx + 1}…`);
      const result = await mcp.rewriteText({
        segmentType: "option",
        currentText,
        context: {
          subject: effectiveSubject,
          difficulty: "intermediate",
          stem: String(item.text || ""),
          options,
          optionIndex: optionIdx,
          correctIndex: typeof item.correctIndex === "number" ? item.correctIndex : -1,
          role: (typeof item.correctIndex === "number" && item.correctIndex === optionIdx) ? "correct" : "distractor",
          guidance: "Preserve the role of this option. Output HTML only.",
        },
        candidateCount: 1,
      });
      if (result?.candidates?.[0]?.text) {
        setItemField(runIdx, itemIdx, (it) => {
          const nextOptions = Array.isArray(it.options) ? [...it.options] : [];
          nextOptions[optionIdx] = result.candidates[0].text;
          return { ...it, options: nextOptions };
        });
        toast.success("AI rewrite applied");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI rewrite failed");
    }
  };

  const aiGenerateOptionImage = async (runIdx: number, itemIdx: number, optionIdx: number) => {
    const run = runs[runIdx];
    const item = run?.generated?.items?.[itemIdx];
    if (!course || !run || !item) return;
    const options = Array.isArray(item.options) ? item.options.map(String) : [];
    const optionText = String(options[optionIdx] || "");
    if (!optionText.trim()) {
      toast.error("Option is empty");
      return;
    }
    try {
      toast.info(`Generating image for option ${optionIdx + 1}…`);
      const stemPlain = stripHtml(String(item.text || "")).slice(0, 140);
      const optPlain = stripHtml(optionText).slice(0, 140);
      const prompt = [
        `Educational visual for ${effectiveSubject}.`,
        `Question context: ${stemPlain}`,
        `This answer option represents: ${optPlain}`,
        `Create a clean photo or realistic illustration that visually represents this option/answer choice.`,
        `IMPORTANT: Absolutely no text, letters, words, labels, numbers, or written language anywhere in the image.`,
        `No charts or infographics. No copyrighted characters or brands.`,
        `Square aspect ratio (1:1) suitable for an option tile.`,
      ]
        .filter(Boolean)
        .join(" ");

      const res = (await callEdgeFunction<any, any>("ai-generate-media", {
        prompt,
        kind: "image",
        options: { aspectRatio: "1:1", size: "1024x1024", quality: "standard" },
      })) as any;

      if (!res?.url) throw new Error("AI media generation returned no url");

      setItemField(runIdx, itemIdx, (it) => {
        const next = { ...(it as any) };
        const optionMedia = Array.isArray(next.optionMedia) ? [...next.optionMedia] : [];
        optionMedia[optionIdx] = { type: "image", url: res.url, alt: res.alt || `Option ${optionIdx + 1} image` };
        next.optionMedia = optionMedia;
        return next;
      });
      toast.success("Option image added (remember to Save at the end)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI image generation failed");
    }
  };

  const uploadOptionImage = (runIdx: number, itemIdx: number, optionIdx: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        toast.info("Uploading image…");
        const path = `temp/${Date.now()}-${file.name}`;
        const uploadRes = await uploadMediaFile(path, file, "courses");
        if (!uploadRes?.ok || !uploadRes?.url) throw new Error("Upload failed");
        setItemField(runIdx, itemIdx, (it) => {
          const next = { ...(it as any) };
          const optionMedia = Array.isArray(next.optionMedia) ? [...next.optionMedia] : [];
          optionMedia[optionIdx] = { type: "image", url: uploadRes.url, alt: file.name };
          next.optionMedia = optionMedia;
          return next;
        });
        toast.success("Uploaded");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
    };
    input.click();
  };

  const saveSelectedToCourse = async () => {
    if (!courseId || !course) return;

    const picked: Array<{ item: any; sourceStudyTextId: string; sourceTempCourseId: string }> = [];
    for (const r of runs) {
      if (r.status !== "done" || !r.generated) continue;
      const generatedCourseId = String((r.generated as any)?.course?.id || r.tempCourseId);
      const items = Array.isArray(r.generated.items) ? r.generated.items : [];
      for (const it of items) {
        const key = `${generatedCourseId}:${String(it?.id ?? "")}`;
        if (!selectedItemKeys.has(key)) continue;
        picked.push({ item: it, sourceStudyTextId: r.studyTextId, sourceTempCourseId: generatedCourseId });
      }
    }

    if (picked.length === 0) {
      toast.error("No exercises selected");
      return;
    }

    if (
      !confirm(
        `Save ${picked.length} selected exercise(s) into course "${course.title}" (${courseId})?\n\nThis will append items and create a new group "Expertcollege Generated" if needed.`
      )
    ) {
      return;
    }

    try {
      setSaving(true);
      toast.info("Saving to course…");

      const { nextGroups, nextItems, addedCount } = mergeExpertcollegeGeneratedExercises({
        targetCourse: course,
        selected: picked.map((p) => ({ item: p.item, relatedStudyTextId: p.sourceStudyTextId })),
      });

      const ops = [
        { op: "replace", path: "/groups", value: nextGroups },
        { op: "replace", path: "/items", value: nextItems },
      ];

      await mcp.updateCourse(courseId, ops);
      toast.success(`Saved ${addedCount} exercise(s) to course`);

      // Refresh local course state so subsequent runs use latest ids/groups
      await loadCourse();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save to course");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-lg">Loading…</span>
        </div>
      </PageContainer>
    );
  }

  if (error || !courseId) {
    return (
      <PageContainer>
        <div className="max-w-3xl mx-auto py-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                Failed to load
              </CardTitle>
              <CardDescription>{error || "Missing courseId"}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={() => navigate("/admin/expertcollege-exercise-generation/select")}
                data-cta-id="cta-ecgen-back-to-selector"
                data-action="navigate"
                data-target="/admin/expertcollege-exercise-generation/select"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to selector
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    );
  }

  if (studyTexts.length === 0) {
    return (
      <PageContainer>
        <div className="max-w-3xl mx-auto py-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-600" />
                BLOCKED: No study texts
              </CardTitle>
              <CardDescription>
                This course has no <code>studyTexts</code>. Add study texts in the Course Editor first.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => navigate(`/admin/editor/${courseId}`)}
                data-cta-id="cta-ecgen-open-course-editor"
                data-action="navigate"
                data-target={`/admin/editor/${courseId}`}
              >
                Open Course Editor
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate("/admin/expertcollege-exercise-generation/select")}
                data-cta-id="cta-ecgen-back-to-selector-2"
                data-action="navigate"
                data-target="/admin/expertcollege-exercise-generation/select"
              >
                Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto py-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6" />
              Expertcollege exercise generation editor
            </h1>
            <p className="text-sm text-muted-foreground">
              Course: <span className="font-mono">{courseId}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate("/admin/expertcollege-exercise-generation/select")}
              data-cta-id="cta-ecgen-back"
              data-action="navigate"
              data-target="/admin/expertcollege-exercise-generation/select"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Change course
            </Button>
          </div>
        </div>

        {/* Selection / settings */}
        <Card>
          <CardHeader>
            <CardTitle>Generate AI exercises</CardTitle>
            <CardDescription>Select your scope to create AI-powered exercises from study texts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ecgen-subject">Subject</Label>
                <Input
                  id="ecgen-subject"
                  value={subjectOverride}
                  onChange={(e) => setSubjectOverride(e.target.value)}
                  placeholder={effectiveSubject}
                  data-cta-id="cta-ecgen-subject"
                  data-action="edit"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ecgen-audience">Audience (grade_band)</Label>
                <Input
                  id="ecgen-audience"
                  value={audienceOverride}
                  onChange={(e) => setAudienceOverride(e.target.value)}
                  placeholder={effectiveAudience}
                  data-cta-id="cta-ecgen-audience"
                  data-action="edit"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Scope</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={scopeMode === "single" ? "default" : "outline"}
                  onClick={() => applyScopeMode("single")}
                  data-cta-id="cta-ecgen-scope-single"
                  data-action="select"
                >
                  Single Study Text
                </Button>
                <Button
                  type="button"
                  variant={scopeMode === "selected" ? "default" : "outline"}
                  onClick={() => applyScopeMode("selected")}
                  data-cta-id="cta-ecgen-scope-selected"
                  data-action="select"
                >
                  Selected Study Texts
                </Button>
                <Button
                  type="button"
                  variant={scopeMode === "course" ? "default" : "outline"}
                  onClick={() => applyScopeMode("course")}
                  data-cta-id="cta-ecgen-scope-course"
                  data-action="select"
                >
                  Full Course
                </Button>
              </div>
            </div>

            {scopeMode !== "course" && (
              <div className="space-y-2">
                <Label>Study texts</Label>
                <div className="flex flex-col gap-2">
                  {studyTexts.map((st) => {
                    const id = String(st.id);
                    const checked = selectedStudyTextIds.has(id);
                    const isDisabled = scopeMode === "single" && !checked && selectedStudyTextIds.size >= 1;
                    return (
                      <div
                        key={id}
                        className="flex flex-col rounded-lg border bg-card overflow-hidden"
                      >
                        <div
                          className="flex items-start gap-3 p-3"
                          data-cta-id={`cta-ecgen-studytext-row-${id}`}
                          data-action="select"
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (scopeMode === "single") {
                              setSelectedStudyTextIds(new Set([id]));
                            } else {
                              toggleStudyText(id);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              if (scopeMode === "single") setSelectedStudyTextIds(new Set([id]));
                              else toggleStudyText(id);
                            }
                          }}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={isDisabled}
                            onCheckedChange={() => {
                              if (scopeMode === "single") setSelectedStudyTextIds(new Set([id]));
                              else toggleStudyText(id);
                            }}
                            data-cta-id={`cta-ecgen-studytext-check-${id}`}
                            data-action="select"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-sm truncate">{st.title || "Untitled study text"}</div>
                            <div className="text-xs text-muted-foreground line-clamp-2">
                              {stripHtml(st.content).slice(0, 160)}
                              {stripHtml(st.content).length > 160 ? "…" : ""}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 px-2"
                            onClick={(e) => toggleStudyTextExpand(id, e)}
                            data-cta-id={`cta-ecgen-studytext-expand-${id}`}
                            data-action="toggle"
                            aria-label={expandedStudyTextIds.has(id) ? "Collapse" : "Expand"}
                          >
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${expandedStudyTextIds.has(id) ? "rotate-180" : ""}`}
                            />
                          </Button>
                        </div>
                        {expandedStudyTextIds.has(id) && (
                          <div className="border-t bg-muted/30 p-4 text-sm max-h-80 overflow-y-auto">
                            <div
                              className="prose prose-sm dark:prose-invert max-w-none"
                              dangerouslySetInnerHTML={{ __html: st.content || "<em>No content</em>" }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                Protocol: <code>ec-expert</code> • Items per objective: <code>3</code>
              </div>
              <Button
                onClick={startGeneration}
                disabled={pageMode === "generating"}
                data-cta-id="cta-ecgen-start"
                data-action="action"
              >
                {pageMode === "generating" ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate exercises
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Generating */}
        {(pageMode === "generating" || pageMode === "review") && runs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Generation progress</CardTitle>
              <CardDescription>
                {stats.done}/{stats.total} completed{stats.failed ? ` • ${stats.failed} failed` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress
                value={stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0}
                data-cta-id="cta-ecgen-progress"
              />
              <div className="space-y-2">
                {runs.map((r, idx) => (
                  <div key={`${r.studyTextId}:${idx}`} className="flex items-center justify-between gap-3 p-3 border rounded-lg">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{r.studyTextTitle}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.status === "failed" ? r.error : r.jobId ? `jobId: ${r.jobId}` : "not enqueued"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.status === "queued" ? (
                        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" title="Queued: Job is waiting for the AI worker to start processing">
                          <Loader2 className="h-4 w-4 animate-spin" /> Queued
                        </span>
                      ) : r.status === "running" ? (
                        <span className="inline-flex items-center gap-2 text-sm text-blue-700" title="Running: AI is analyzing the study text and generating exercises">
                          <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                        </span>
                      ) : r.status === "done" ? (
                        <span className="inline-flex items-center gap-2 text-sm text-green-700" title="Done: Exercises generated successfully">
                          <CheckCircle2 className="h-4 w-4" /> Complete
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-sm text-red-700" title={`Failed: ${r.error || "Generation error"}`}>
                          <AlertCircle className="h-4 w-4" /> Failed
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Review */}
        {pageMode === "review" && runs.some((r) => r.status === "done") && (
          <Card>
            <CardHeader>
              <CardTitle>Review generated exercises</CardTitle>
              <CardDescription>
                Expand an exercise to edit. Use ✨ AI Rewrite, 🎨 AI Image, 🖼️ Upload — same icon language as the Course Editor.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {runs
                .map((r, runIdx) => ({ r, runIdx }))
                .filter(({ r }) => r.status === "done" && r.generated)
                .map(({ r, runIdx }) => {
                  const generatedCourseId = r.generated?.course?.id || r.tempCourseId;
                  const items = r.generated?.items || [];
                  return (
                    <div key={`${r.studyTextId}:${generatedCourseId}`} className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-bold">{r.studyTextTitle}</div>
                          <div className="text-xs text-muted-foreground">
                            Generated items: {items.length} • tempCourseId: <span className="font-mono">{generatedCourseId}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {items.map((it: any, itemIdx: number) => {
                          const itemKey = `${generatedCourseId}:${String(it?.id ?? itemIdx)}`;
                          const expanded = expandedKeys.has(itemKey);
                          const selected = selectedItemKeys.has(itemKey);
                          const options = Array.isArray(it?.options) ? (it.options as any[]).map(String) : [];
                          const correctIndex = typeof it?.correctIndex === "number" ? it.correctIndex : -1;

                          return (
                            <div key={itemKey} className="border rounded-lg overflow-hidden">
                              <div className="flex items-start gap-3 p-3 bg-card">
                                <Checkbox
                                  checked={selected}
                                  onCheckedChange={() => toggleSelectedItem(itemKey)}
                                  data-cta-id={`cta-ecgen-item-check-${itemKey}`}
                                  data-action="select"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-semibold line-clamp-2">{stripHtml(String(it?.text || "")).slice(0, 180)}</div>
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {options.length} options • correctIndex: {correctIndex}
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleExpanded(itemKey)}
                                  data-cta-id={`cta-ecgen-item-toggle-${itemKey}`}
                                  data-action="toggle"
                                >
                                  <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                                </Button>
                              </div>

                              {expanded && (
                                <div className="p-4 bg-muted/20 space-y-4">
                                  {/* Stem */}
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Stem</div>
                                      <div className="flex items-center gap-2">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          title="AI rewrite"
                                          onClick={() => void aiRewriteStem(runIdx, itemIdx)}
                                          data-cta-id={`cta-ecgen-stem-ai-rewrite-${itemKey}`}
                                          data-action="action"
                                        >
                                          ✨
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          title="AI image"
                                          onClick={() => void aiGenerateStemImage(runIdx, itemIdx)}
                                          data-cta-id={`cta-ecgen-stem-ai-image-${itemKey}`}
                                          data-action="action"
                                        >
                                          🎨
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          title="Upload image"
                                          onClick={() => uploadStemImage(runIdx, itemIdx)}
                                          data-cta-id={`cta-ecgen-stem-upload-${itemKey}`}
                                          data-action="action"
                                        >
                                          🖼️
                                        </Button>
                                      </div>
                                    </div>
                                    <textarea
                                      className="w-full min-h-[110px] rounded-md border p-3 text-sm"
                                      value={String(it?.text || "")}
                                      onChange={(e) => setItemField(runIdx, itemIdx, (x) => ({ ...x, text: e.target.value }))}
                                      data-cta-id={`cta-ecgen-stem-input-${itemKey}`}
                                      data-action="edit"
                                    />
                                  </div>

                                  {/* Options */}
                                  <div className="space-y-2">
                                    <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Options</div>
                                    <div className="space-y-2">
                                      {options.map((optText, optIdx) => {
                                        const isCorrect = optIdx === correctIndex;
                                        const hasMedia = !!(it?.optionMedia?.[optIdx]?.url);
                                        return (
                                          <div key={`${itemKey}:opt:${optIdx}`} className="flex items-center gap-2">
                                            <div className="w-7 text-center text-xs font-bold">{String.fromCharCode(65 + optIdx)}</div>
                                            <Input
                                              value={optText}
                                              onChange={(e) =>
                                                setItemField(runIdx, itemIdx, (x) => {
                                                  const nextOptions = Array.isArray(x.options) ? [...x.options] : [];
                                                  nextOptions[optIdx] = e.target.value;
                                                  return { ...x, options: nextOptions };
                                                })
                                              }
                                              className={isCorrect ? "border-green-500" : ""}
                                              data-cta-id={`cta-ecgen-option-input-${itemKey}-${optIdx}`}
                                              data-action="edit"
                                            />
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              title="AI rewrite"
                                              onClick={() => void aiRewriteOption(runIdx, itemIdx, optIdx)}
                                              data-cta-id={`cta-ecgen-option-ai-rewrite-${itemKey}-${optIdx}`}
                                              data-action="action"
                                            >
                                              ✨
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              title="AI image"
                                              onClick={() => void aiGenerateOptionImage(runIdx, itemIdx, optIdx)}
                                              data-cta-id={`cta-ecgen-option-ai-image-${itemKey}-${optIdx}`}
                                              data-action="action"
                                            >
                                              🎨
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              title={hasMedia ? "Replace image" : "Upload image"}
                                              onClick={() => uploadOptionImage(runIdx, itemIdx, optIdx)}
                                              data-cta-id={`cta-ecgen-option-upload-${itemKey}-${optIdx}`}
                                              data-action="action"
                                            >
                                              🖼️
                                            </Button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  onClick={() => setPageMode("select")}
                  data-cta-id="cta-ecgen-back-to-selection"
                  data-action="action"
                >
                  Back to selection
                </Button>
                <Button
                  onClick={() => void saveSelectedToCourse()}
                  disabled={saving}
                  data-cta-id="cta-ecgen-save-to-course"
                  data-action="action"
                >
                  {saving ? "Saving…" : "Save selected to course"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}


