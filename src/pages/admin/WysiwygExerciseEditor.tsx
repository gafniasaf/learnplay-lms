import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";
import { isDevAgentMode } from "@/lib/api/common";
import { cn } from "@/lib/utils";
import { Course } from "@/lib/types/course";
import { logger } from "@/lib/logging";
import { WysiwygStemCard } from "@/components/admin/wysiwyg/WysiwygStemCard";
import { WysiwygOptionTile } from "@/components/admin/wysiwyg/WysiwygOptionTile";
import { WysiwygExplanationCard } from "@/components/admin/wysiwyg/WysiwygExplanationCard";
import { resolvePublicMediaUrl } from "@/lib/media/resolvePublicMediaUrl";
import { getDefaultVariantLevel, type VariantLevel } from "@/lib/utils/variantResolution";
import type { PatchOperation } from "@/lib/utils/patchBuilder";
import {
  escapeHtmlAttr,
  generateOptionImage,
  generateStemImage,
  getExplanationHtml,
  getOptionPrimaryMedia,
  getOptionsHtml,
  getStemHtml,
  getStemPrimaryMedia,
  setExplanationHtml,
  setOptionHtml,
  setOptionPrimaryMedia,
  setStemHtml,
  setStemPrimaryMedia,
  type MediaAsset,
} from "@/lib/editor/wysiwygActions";

type CourseItemLike = any;

const stripHtml = (s: string) => String(s || "").replace(/<[^>]*>/g, "");

export default function WysiwygExerciseEditor() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, role, loading: authLoading } = useAuth();
  const mcp = useMCP();
  const getCourseRef = useRef(mcp.getCourse);
  useEffect(() => {
    getCourseRef.current = mcp.getCourse;
  }, [mcp]);

  const devAgent = isDevAgentMode();
  const devOverrideRole = typeof window !== "undefined" ? localStorage.getItem("role") : null;
  const isAdmin =
    devAgent ||
    role === "admin" ||
    devOverrideRole === "admin" ||
    user?.app_metadata?.role === "admin" ||
    user?.user_metadata?.role === "admin";

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [activeItemIndex, setActiveItemIndex] = useState(0);

  // keep local unsaved item ids (groupIdx-itemIdx, matches CourseEditorV3 ops)
  const [unsavedItems, setUnsavedItems] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [_stemAiImageLoading, setStemAiImageLoading] = useState(false);
  const [_optionAiImageLoading, setOptionAiImageLoading] = useState<Set<number>>(new Set());

  const variantLevel: VariantLevel = useMemo(() => {
    if (!course) return "intermediate";
    return getDefaultVariantLevel(course as any);
  }, [course]);

  const groups = (course as any)?.groups || [];
  const currentItem: CourseItemLike | null = groups?.[activeGroupIndex]?.items?.[activeItemIndex] || null;

  const loadCourse = useCallback(async () => {
    if (!courseId) return;
    try {
      setLoading(true);
      const courseData = (await getCourseRef.current(courseId)) as unknown as Course;

      // Attach nested items per group for navigation (matches CourseEditorV3 behavior)
      const transformedCourse = { ...courseData };
      const loadedGroups = (courseData as any).groups || [];
      const items = (courseData as any).items || [];
      if (loadedGroups.length > 0) {
        (transformedCourse as any).groups = loadedGroups.map((group: any) => ({
          ...group,
          items: items.filter((it: any) => it.groupId === group.id),
        }));
      }

      setCourse(transformedCourse as Course);
      setUnsavedItems(new Set());
      setError(null);
    } catch (e) {
      logger.error("[WysiwygExerciseEditor] Failed to load course:", e);
      setError(e instanceof Error ? e.message : "Failed to load course");
      setCourse(null);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (!courseId || !isAdmin) {
      if (!authLoading && !isAdmin) navigate("/admin");
      return;
    }
    void loadCourse();
  }, [courseId, isAdmin, authLoading, navigate, loadCourse]);

  const totalItemsInCourse = useMemo(() => {
    const all = (groups || []).flatMap((g: any) => (Array.isArray(g?.items) ? g.items : []));
    return all.length;
  }, [groups]);

  const flatIndex = useMemo(() => {
    let idx = 0;
    for (let gi = 0; gi < (groups || []).length; gi++) {
      const items = Array.isArray(groups[gi]?.items) ? groups[gi].items : [];
      for (let ii = 0; ii < items.length; ii++) {
        if (gi === activeGroupIndex && ii === activeItemIndex) return idx;
        idx++;
      }
    }
    return 0;
  }, [groups, activeGroupIndex, activeItemIndex]);

  const setActiveByFlatIndex = useCallback(
    (target: number) => {
      let idx = 0;
      for (let gi = 0; gi < (groups || []).length; gi++) {
        const items = Array.isArray(groups[gi]?.items) ? groups[gi].items : [];
        for (let ii = 0; ii < items.length; ii++) {
          if (idx === target) {
            setActiveGroupIndex(gi);
            setActiveItemIndex(ii);
            return;
          }
          idx++;
        }
      }
    },
    [groups]
  );

  const navigateExercise = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(totalItemsInCourse - 1, flatIndex + delta));
      setActiveByFlatIndex(next);
    },
    [flatIndex, totalItemsInCourse, setActiveByFlatIndex]
  );

  const flattenItemsForStorage = useCallback((courseGroups: any[]) => {
    return (courseGroups || []).flatMap((g: any) =>
      (Array.isArray(g?.items) ? g.items : []).map((it: any) => ({
        ...(it || {}),
        groupId: g?.id,
      }))
    );
  }, []);

  const replaceCurrentItem = useCallback(
    (updatedItem: any) => {
      if (!course) return;
      const courseGroups = (groups || []).map((g: any) => ({ ...g, items: [...(g.items || [])] }));
      if (!courseGroups[activeGroupIndex]?.items) return;

      courseGroups[activeGroupIndex].items[activeItemIndex] = updatedItem;

      const updated: any = { ...(course as any), groups: courseGroups };
      updated.items = flattenItemsForStorage(courseGroups);
      setCourse(updated as Course);
      setUnsavedItems((prev) => new Set(prev).add(`${activeGroupIndex}-${activeItemIndex}`));
    },
    [course, groups, activeGroupIndex, activeItemIndex, flattenItemsForStorage]
  );

  // Update current item in course state (in-memory)
  const patchCurrentItem = useCallback(
    (patch: Partial<CourseItemLike>) => {
      if (!currentItem) return;
      replaceCurrentItem({ ...(currentItem as any), ...(patch as any) });
    },
    [currentItem, replaceCurrentItem]
  );

  const generatePatchOps = useCallback((): PatchOperation[] => {
    if (!course || unsavedItems.size === 0) return [];
    const ops: PatchOperation[] = [];

    // WYSIWYG editor only does item-level edits (no group reorder), so we patch item indices.
    unsavedItems.forEach((key) => {
      const parts = key.split("-").map(Number);
      if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return;
      const [groupIdx, itemIdx] = parts;
      const group = groups[groupIdx];
      const item = group?.items?.[itemIdx];
      if (!item) return;

      let globalItemIndex = 0;
      for (let g = 0; g < groupIdx; g++) {
        globalItemIndex += groups[g]?.items?.length || 0;
      }
      globalItemIndex += itemIdx;

      ops.push({ op: "replace", path: `/items/${globalItemIndex}`, value: item });
    });

    return ops;
  }, [course, unsavedItems, groups]);

  const handleSave = async () => {
    if (!course || !courseId || unsavedItems.size === 0) {
      toast({ title: "No changes to save" });
      return;
    }
    try {
      setSaving(true);
      const ops = generatePatchOps();
      if (ops.length === 0) {
        toast({ title: "No changes to save" });
        return;
      }

      const res = (await mcp.updateCourse(courseId, ops)) as any;
      if (res && typeof res === "object" && "ok" in res && res.ok === false) {
        throw new Error("Update failed");
      }

      toast({ title: "Saved", description: `${ops.length} change(s) applied` });
      setUnsavedItems(new Set());
      await loadCourse();
    } catch (e) {
      logger.error("[WysiwygExerciseEditor] Save failed:", e);
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Failed to save",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Render helpers: use Play-identical Tailwind classes
  const stemHtml = getStemHtml(currentItem, variantLevel);
  const stemPrimaryMedia = getStemPrimaryMedia(currentItem, variantLevel);

  const options = useMemo(() => {
    return getOptionsHtml(currentItem, variantLevel);
  }, [currentItem, variantLevel]);

  const correctIndex: number = typeof (currentItem as any)?.correctIndex === "number" ? (currentItem as any).correctIndex : -1;

  const cacheKey = String((course as any)?.contentVersion || "");

  const explanationHtml = getExplanationHtml(currentItem, variantLevel);

  const handleAIRewriteStem = async () => {
    if (!currentItem || !course) return;
    const currentText = stemHtml;
    if (!currentText) {
      toast({ title: "No stem text to rewrite", variant: "destructive" });
      return;
    }

    try {
      const optionsTexts = options;
      const result = await mcp.rewriteText({
        segmentType: "stem",
        currentText,
        context: {
          subject: (course as any).subject || course.title,
          difficulty: "intermediate",
          mode: (currentItem as any).mode || "options",
          options: optionsTexts,
          correctIndex: (currentItem as any).correctIndex ?? -1,
          guidance: "Rewrite the question clearly without changing its meaning or the expected correct option/answer. Keep HTML only.",
          course: { id: (course as any).id, title: (course as any).title, description: (course as any).description },
        },
        candidateCount: 1,
      });
      const next = result?.candidates?.[0]?.text;
      if (next) {
        replaceCurrentItem(setStemHtml(currentItem, variantLevel, next));
        toast({ title: "AI rewrite applied" });
      }
    } catch (e) {
      logger.error("[WysiwygExerciseEditor] AI rewrite (stem) failed:", e);
      toast({
        title: "AI rewrite failed",
        description: e instanceof Error ? e.message : "AI rewrite failed",
        variant: "destructive",
      });
    }
  };

  const uploadFile = async (accept: string): Promise<File | null> => {
    return await new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0] || null;
        resolve(file);
      };
      input.click();
    });
  };

  const handleUploadStemMedia = async () => {
    if (!currentItem) return;
    try {
      const file = await uploadFile("image/*,audio/*,video/*");
      if (!file) return;

      const path = `temp/${Date.now()}-${file.name}`;
      const result = await mcp.uploadMediaFile(file, path);
      if (!result?.ok) throw new Error("Upload failed");

      const media: MediaAsset = {
        type: file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : "video",
        url: result.url,
        alt: file.name,
      };

      replaceCurrentItem(setStemPrimaryMedia(currentItem, variantLevel, media));
      toast({ title: "Media attached (remember to Save)" });
    } catch (e) {
      logger.error("[WysiwygExerciseEditor] Stem upload failed:", e);
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Upload failed",
        variant: "destructive",
      });
    }
  };

  const handleAIGenerateStemImage = async () => {
    if (!currentItem || !course) return;
    try {
      setStemAiImageLoading(true);
      const res = await generateStemImage({ course, item: currentItem });
      const media: MediaAsset = {
        type: "image",
        url: res.url,
        alt: res.alt || "Course image",
      };
      replaceCurrentItem(setStemPrimaryMedia(currentItem, variantLevel, media));
      toast({ title: "AI image attached (remember to Save)" });
    } catch (e) {
      logger.error("[WysiwygExerciseEditor] Stem AI image generation failed:", e);
      toast({
        title: "AI image generation failed",
        description: e instanceof Error ? e.message : "AI image generation failed",
        variant: "destructive",
      });
    } finally {
      setStemAiImageLoading(false);
    }
  };

  const handleAIGenerateExplanationImage = async () => {
    if (!currentItem || !course) return;
    try {
      // Reuse stem-context prompt so the image matches the exercise.
      const res = await generateStemImage({ course, item: currentItem });
      const imgHtml = `<p><img src="${escapeHtmlAttr(res.url)}" alt="${escapeHtmlAttr(res.alt || "Explanation image")}" /></p>`;
      const nextHtml = explanationHtml?.trim() ? `${imgHtml}${explanationHtml}` : imgHtml;
      replaceCurrentItem(setExplanationHtml(currentItem, variantLevel, nextHtml));
      toast({ title: "AI image inserted (remember to Save)" });
    } catch (e) {
      logger.error("[WysiwygExerciseEditor] Explanation AI image generation failed:", e);
      toast({
        title: "AI image generation failed",
        description: e instanceof Error ? e.message : "AI image generation failed",
        variant: "destructive",
      });
    }
  };

  const handleAIRewriteOption = async (index: number) => {
    if (!currentItem || !course) return;
    const optionText = options[index];
    if (!optionText) {
      toast({ title: "Option not found", variant: "destructive" });
      return;
    }
    try {
      const result = await mcp.rewriteText({
        segmentType: "option",
        currentText: optionText,
        context: {
          subject: (course as any).subject || course.title,
          difficulty: "intermediate",
          stem: stemHtml,
          options,
          optionIndex: index,
          correctIndex: (currentItem as any).correctIndex ?? -1,
          role: ((currentItem as any).correctIndex ?? -1) === index ? "correct" : "distractor",
          guidance: "Preserve the role of this option. Output HTML only.",
        },
        candidateCount: 1,
      });
      const next = result?.candidates?.[0]?.text;
      if (next) {
        replaceCurrentItem(setOptionHtml(currentItem, variantLevel, index, next));
        toast({ title: "AI rewrite applied" });
      }
    } catch (e) {
      logger.error("[WysiwygExerciseEditor] AI rewrite (option) failed:", e);
      toast({
        title: "AI rewrite failed",
        description: e instanceof Error ? e.message : "AI rewrite failed",
        variant: "destructive",
      });
    }
  };

  const handleUploadOptionMedia = async (index: number) => {
    if (!currentItem) return;
    try {
      const file = await uploadFile("image/*,audio/*,video/*");
      if (!file) return;

      const path = `temp/${Date.now()}-${file.name}`;
      const result = await mcp.uploadMediaFile(file, path);
      if (!result?.ok) throw new Error("Upload failed");

      const media: MediaAsset = {
        type: file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : "video",
        url: result.url,
        alt: file.name,
      };

      replaceCurrentItem(setOptionPrimaryMedia(currentItem, variantLevel, index, media));
      toast({ title: `Option ${index + 1} media attached (remember to Save)` });
    } catch (e) {
      logger.error("[WysiwygExerciseEditor] Option upload failed:", e);
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Upload failed",
        variant: "destructive",
      });
    }
  };

  const handleAIGenerateOptionImage = async (index: number) => {
    if (!currentItem || !course) return;
    const optionText = options[index];
    if (!optionText) {
      toast({ title: "Option not found", variant: "destructive" });
      return;
    }
    try {
      setOptionAiImageLoading((prev) => new Set(prev).add(index));
      const res = await generateOptionImage({ course, item: currentItem, optionText, index });
      const media: MediaAsset = {
        type: "image",
        url: res.url,
        alt: res.alt || `Option ${index + 1} image`,
      };
      replaceCurrentItem(setOptionPrimaryMedia(currentItem, variantLevel, index, media));
      toast({ title: `AI image attached to option ${index + 1} (remember to Save)` });
    } catch (e) {
      logger.error("[WysiwygExerciseEditor] Option AI image generation failed:", e);
      toast({
        title: "AI image generation failed",
        description: e instanceof Error ? e.message : "AI image generation failed",
        variant: "destructive",
      });
    } finally {
      setOptionAiImageLoading((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleAIRewriteExplanation = async () => {
    if (!currentItem || !course) return;
    const referenceText = explanationHtml;
    const hasExistingText = referenceText.trim().length > 0;

    try {
      const correctOption = correctIndex >= 0 && options[correctIndex] ? options[correctIndex] : null;
      const guidance = hasExistingText
        ? "Rewrite the explanation to be clearer and more helpful. Output HTML only."
        : `Write a clear, educational explanation of why "${correctOption || "the correct answer"}" is the correct answer. Explain the concept in a way that helps students understand. Output HTML only.`;

      const result = await mcp.rewriteText({
        segmentType: "reference",
        currentText: hasExistingText ? referenceText : "<p>Generate an explanation...</p>",
        context: {
          subject: (course as any).subject || course.title,
          difficulty: "intermediate",
          stem: stemHtml,
          options,
          correctIndex,
          guidance,
          course: {
            id: (course as any).id,
            title: (course as any).title,
            description: (course as any).description,
            gradeBand: (course as any).gradeBand,
            subject: (course as any).subject,
          },
        },
        candidateCount: 1,
      });

      const next = result?.candidates?.[0]?.text;
      if (next) {
        replaceCurrentItem(setExplanationHtml(currentItem, variantLevel, next));
        toast({ title: hasExistingText ? "AI rewrite applied" : "Explanation generated" });
      }
    } catch (e) {
      logger.error("[WysiwygExerciseEditor] AI rewrite (explanation) failed:", e);
      toast({
        title: "AI generation failed",
        description: e instanceof Error ? e.message : "AI generation failed",
        variant: "destructive",
      });
    }
  };

  const handleUploadExplanationImage = async () => {
    if (!currentItem) return;
    try {
      const file = await uploadFile("image/*");
      if (!file) return;
      const path = `temp/${Date.now()}-${file.name}`;
      const result = await mcp.uploadMediaFile(file, path);
      if (!result?.ok) throw new Error("Upload failed");

      const absoluteUrl = resolvePublicMediaUrl(result.url, cacheKey);
      const imgHtml = `<p><img src="${escapeHtmlAttr(absoluteUrl)}" alt="${escapeHtmlAttr(file.name)}" /></p>`;
      const nextHtml = explanationHtml?.trim() ? `${imgHtml}${explanationHtml}` : imgHtml;
      replaceCurrentItem(setExplanationHtml(currentItem, variantLevel, nextHtml));
      toast({ title: "Image inserted (remember to Save)" });
    } catch (e) {
      logger.error("[WysiwygExerciseEditor] Explanation image upload failed:", e);
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Upload failed",
        variant: "destructive",
      });
    }
  };

  const SidebarItem = ({
    label,
    active,
    onClick,
    ctaId,
  }: {
    label: string;
    active: boolean;
    onClick: () => void;
    ctaId: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left text-[11px] font-medium p-2.5 rounded-md cursor-pointer transition-colors",
        active ? "bg-muted border-l-2 border-amber-500 text-foreground" : "text-muted-foreground hover:bg-muted/60"
      )}
      data-cta-id={ctaId}
      data-action="navigate"
    >
      {label}
    </button>
  );

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-[60vh] text-sm text-muted-foreground">
          Loading…
        </div>
      </PageContainer>
    );
  }

  if (error || !course) {
    return (
      <PageContainer>
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="text-lg font-semibold">Failed to load</div>
          <div className="text-sm text-muted-foreground">{error || "Unknown error"}</div>
          <Button
            variant="outline"
            onClick={() => void loadCourse()}
            data-cta-id="cta-wysiwyg-retry-load"
            data-action="action"
          >
            Retry
          </Button>
        </div>
      </PageContainer>
    );
  }

  // If course has no groups/items, fail loud (no silent fallback)
  if (!Array.isArray(groups) || groups.length === 0) {
    return (
      <PageContainer>
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="text-lg font-semibold">BLOCKED</div>
          <div className="text-sm text-muted-foreground">
            This course has no groups/items in editor navigation shape. Please ensure the course JSON includes
            `groups` and `items` as expected by the editor.
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <div className="w-full">
      <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 py-3">
        {/* Compact header */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{course.title || courseId}</div>
            <div className="text-[11px] text-muted-foreground">
              Exercise {flatIndex + 1} of {totalItemsInCourse}
              {unsavedItems.size > 0 ? ` • ${unsavedItems.size} unsaved` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/admin/wysiwyg-exercise-editor/select")}
              data-cta-id="cta-wysiwyg-back-to-select"
              data-action="navigate"
            >
              Back
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving || unsavedItems.size === 0}
              data-cta-id="cta-wysiwyg-save"
              data-action="action"
            >
              Save
            </Button>
          </div>
        </div>

        <div className="flex gap-3">
          {/* Sidebar */}
          <aside className="w-64 bg-background border rounded-lg p-2 overflow-y-auto flex-shrink-0 h-[calc(100vh-180px)]">
            <div className="flex items-center justify-between px-2 py-2">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Exercises</div>
              <div className="text-[11px] text-muted-foreground">
                {flatIndex + 1}/{totalItemsInCourse}
              </div>
            </div>
            <div className="space-y-1">
              {groups.map((g: any, gi: number) => {
                const items = Array.isArray(g?.items) ? g.items : [];
                const groupLabel = String(g?.title || g?.id || `Group ${gi + 1}`);
                return (
                  <div key={String(g?.id ?? gi)} className="space-y-1">
                    <div className="px-2 pt-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {groupLabel}
                    </div>
                    {items.map((it: any, ii: number) => {
                      const active = gi === activeGroupIndex && ii === activeItemIndex;
                      const label = stripHtml(String(it?.stem?.text || it?.text || "Untitled")).slice(0, 60) || "Untitled";
                      return (
                        <SidebarItem
                          key={`${String(g?.id ?? gi)}:${String(it?.id ?? ii)}`}
                          label={label}
                          active={active}
                          onClick={() => {
                            setActiveGroupIndex(gi);
                            setActiveItemIndex(ii);
                          }}
                          ctaId={`cta-wysiwyg-nav-item-${gi}-${ii}`}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Canvas (Play-identical sizing) */}
          <main className="flex-1 min-w-0">
            <div className="play-root w-full bg-gradient-to-br from-primary/5 via-background to-accent/5 p-2 sm:p-3 md:p-4 rounded-xl">
              <div className="w-full max-w-5xl mx-auto h-full flex flex-col overflow-hidden">
                <div className="flex flex-col items-center justify-start min-h-full gap-6 py-2">
                  {/* Stem card */}
                  <WysiwygStemCard
                    stemHtml={stemHtml}
                    mediaUrl={stemPrimaryMedia?.url ? resolvePublicMediaUrl(stemPrimaryMedia.url, cacheKey) : null}
                    mediaAlt={stemPrimaryMedia?.alt || null}
                    onChangeStemHtml={(html) => replaceCurrentItem(setStemHtml(currentItem, variantLevel, html))}
                    onAiRewrite={handleAIRewriteStem}
                    onAiImage={handleAIGenerateStemImage}
                    onUploadMedia={handleUploadStemMedia}
                    cta={{
                      edit: "cta-wysiwyg-stem-edit",
                      aiRewrite: "cta-wysiwyg-stem-ai-rewrite",
                      aiImage: "cta-wysiwyg-stem-ai-image",
                      uploadMedia: "cta-wysiwyg-stem-upload-media",
                    }}
                  />

                  {/* Option grid - Play-identical sizing */}
                  <div className={cn("grid w-full max-w-3xl relative group", "grid-cols-2 gap-x-12 gap-y-5 px-10")}>
                    {options.map((opt, idx) => {
                      const isCorrect = idx === correctIndex;
                      const media = getOptionPrimaryMedia(currentItem, variantLevel, idx);
                      // Keep media buttons always visible; track loading to prevent double-invokes.
                      // (Optional UI indicator could be added later.)
                      return (
                        <WysiwygOptionTile
                          key={idx}
                          index={idx}
                          optionHtml={String(opt || "")}
                          mediaUrl={media?.url ? resolvePublicMediaUrl(media.url, cacheKey) : null}
                          mediaAlt={media?.alt || null}
                          isCorrect={isCorrect}
                          onSetCorrect={() => patchCurrentItem({ correctIndex: idx })}
                          onChangeOptionHtml={(html) => replaceCurrentItem(setOptionHtml(currentItem, variantLevel, idx, html))}
                          onAiRewrite={() => void handleAIRewriteOption(idx)}
                          onAiImage={() => void handleAIGenerateOptionImage(idx)}
                          onUploadMedia={() => void handleUploadOptionMedia(idx)}
                          cta={{
                            edit: `cta-wysiwyg-option-edit-${idx}`,
                            aiRewrite: `cta-wysiwyg-option-ai-rewrite-${idx}`,
                            aiImage: `cta-wysiwyg-option-ai-image-${idx}`,
                            uploadMedia: `cta-wysiwyg-option-media-upload-${idx}`,
                            setCorrect: `cta-wysiwyg-option-set-correct-${idx}`,
                          }}
                        />
                      );
                    })}
                  </div>

                  {/* Explanation */}
                  <WysiwygExplanationCard
                    html={explanationHtml}
                    onChangeHtml={(html) => replaceCurrentItem(setExplanationHtml(currentItem, variantLevel, html))}
                    onAiRewrite={handleAIRewriteExplanation}
                    onAiImage={handleAIGenerateExplanationImage}
                    onUploadMedia={handleUploadExplanationImage}
                    cta={{
                      edit: "cta-wysiwyg-explanation-edit",
                      aiRewrite: "cta-wysiwyg-explanation-ai-rewrite",
                      aiImage: "cta-wysiwyg-explanation-ai-image",
                      uploadMedia: "cta-wysiwyg-explanation-upload-media",
                    }}
                  />

                  {/* Navigation */}
                  <div className="w-full max-w-3xl flex justify-between items-center pt-4 border-t border-border">
                    <Button
                      variant="outline"
                      onClick={() => navigateExercise(-1)}
                      disabled={flatIndex === 0}
                      data-cta-id="cta-wysiwyg-prev"
                      data-action="navigate"
                    >
                      ← Previous
                    </Button>
                    <div className="text-sm text-muted-foreground">
                      Exercise {flatIndex + 1} of {totalItemsInCourse}
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => navigateExercise(1)}
                      disabled={flatIndex >= totalItemsInCourse - 1}
                      data-cta-id="cta-wysiwyg-next"
                      data-action="navigate"
                    >
                      Next →
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}


