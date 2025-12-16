import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { invalidateCourseCache } from '@/lib/utils/cacheInvalidation';
import { editorTelemetry } from '@/lib/utils/telemetry';
import type { PatchOperation } from '@/lib/api/updateCourse';
import { useAuth } from '@/hooks/useAuth';
import { useMCP } from '@/hooks/useMCP';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Navigator } from '@/components/admin/editor/Navigator';
import { StemTab } from '@/components/admin/editor/StemTab';
import { OptionsTab } from '@/components/admin/editor/OptionsTab';
import { ReferenceTab } from '@/components/admin/editor/ReferenceTab';
import { ExercisesTab } from '@/components/admin/editor/ExercisesTab';
import { MediaLibraryPanel } from '@/components/admin/editor/MediaLibraryPanel';
import { ComparePanel } from '@/components/admin/editor/ComparePanel';
import { AIRewriteChatPanel } from '@/components/admin/editor/AIRewriteChatPanel';
import { Link } from 'react-router-dom';
import { JobProgress } from '@/components/shared/JobProgress';
import { ItemPreview } from '@/components/admin/ItemPreview';
import type { Course, CourseItem } from '@/lib/types/course';
import { parseStudyText } from '@/lib/types/studyText';
import { resolvePublicMediaUrl } from '@/lib/media/resolvePublicMediaUrl';
import { generateMedia } from '@/lib/api/aiRewrites';
import { DiffViewer } from '@/components/admin/DiffViewer';
import { logger } from '@/lib/logging';
import { useCoursePublishing } from './editor/hooks/useCoursePublishing';
import { useCourseVariants } from './editor/hooks/useCourseVariants';
import { useCourseCoPilot } from './editor/hooks/useCourseCoPilot';
import { isDevAgentMode } from '@/lib/api/common';

const CourseEditor = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const mcp = useMCP();
  // useMCP can change identity across renders in some environments.
  // Keep stable refs to the methods we use in effects to avoid render loops.
  const getCourseRef = useRef(mcp.getCourse);
  useEffect(() => {
    getCourseRef.current = mcp.getCourse;
  }, [mcp]);
  const publishing = useCoursePublishing();
  const variants = useCourseVariants();
  const copilot = useCourseCoPilot();
  const devAgent = isDevAgentMode();
  
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [unsavedItems, setUnsavedItems] = useState<Set<string>>(new Set());
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('stem');
  const [topLevelTab, setTopLevelTab] = useState<'exercises' | 'studyTexts'>('exercises');
  const [studyTextEditorOpen, setStudyTextEditorOpen] = useState(false);
  const [studyTextEditorIndex, setStudyTextEditorIndex] = useState<number | null>(null);
  const [studyTextEditorTitle, setStudyTextEditorTitle] = useState<string>('');
  const [studyTextEditorDraft, setStudyTextEditorDraft] = useState<string>('');
  const [studyTextEditorLearningObjectives, setStudyTextEditorLearningObjectives] = useState<string>('');
  const [studyTextAiRewriteLoading, setStudyTextAiRewriteLoading] = useState(false);
  const [studyTextAiImageLoading, setStudyTextAiImageLoading] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [showComparePanel, setShowComparePanel] = useState(false);
  const [compareData, setCompareData] = useState<{
    original: string;
    proposed: string;
    type: 'text' | 'media';
    scope: 'stem' | 'reference' | 'option' | 'studyText';
    optionIndex?: number;
    studyTextIndex?: number;
  } | null>(null);
  const [showRewriteChat, setShowRewriteChat] = useState(false);
  const [chatTarget, setChatTarget] = useState<{ segment: 'stem' | 'reference' | 'option'; optionIndex?: number } | null>(null);
  const [coPilotJobId, setCoPilotJobId] = useState<string | null>(null);
  // Destination for Media Library inserts
  const [mediaInsertTarget, setMediaInsertTarget] = useState<{ scope: 'stem' | 'option'; optionIndex?: number }>({ scope: 'stem' });
  const [archivedBanner, setArchivedBanner] = useState<{ at: string; by?: string } | null>(null);
  // Diff preview (Phase 3: dry-run + approve)
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [diffOps, setDiffOps] = useState<Array<{ op: string; path: string; value?: unknown }>>([]);
  const [approving, setApproving] = useState(false);
  const [auditInfo, setAuditInfo] = useState<{ coverage?: number; axes?: string[] } | null>(null);
  const [orgThresholds, setOrgThresholds] = useState<{ variantsCoverageMin: number }>({ variantsCoverageMin: 0.9 });

  // Prevent repeated loads (Lovable preview can re-run effects / remount routes).
  const inFlightLoadRef = useRef(false);
  const lastLoadedCourseIdRef = useRef<string | null>(null);

  // Admin guard
  const devOverrideRole = typeof window !== 'undefined' ? localStorage.getItem('role') : null;
  // In dev-agent mode (Lovable preview), allow editor access without a Supabase session.
  const isAdmin =
    devAgent ||
    role === 'admin' ||
    devOverrideRole === 'admin' ||
    user?.app_metadata?.role === 'admin' ||
    user?.user_metadata?.role === 'admin';

  const hasUnsavedChanges = unsavedItems.size > 0;

  // Leave-page guards (browser refresh/close)
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  const loadCourse = useCallback(async (opts?: { force?: boolean }) => {
    if (!courseId) return;
    const force = opts?.force === true;

    // Avoid duplicate concurrent loads
    if (inFlightLoadRef.current) return;
    // If we already loaded this course and aren't forcing, don't refetch.
    if (!force && lastLoadedCourseIdRef.current === courseId) return;

    try {
      inFlightLoadRef.current = true;
      setLoading(true);
      setError(null);
      editorTelemetry.opened(courseId); // Track editor opened
      const courseData = await getCourseRef.current(courseId) as unknown as Course;
      
      // Transform course structure: group items by groupId
      const transformedCourse = { ...courseData };
      const groups = (courseData as any).groups || [];
      const items = (courseData as any).items || [];
      
      // Initialize empty items arrays for each group
      const groupedItems = groups.map((group: any) => ({
        ...group,
        items: items.filter((item: any) => item.groupId === group.id)
      }));
      
      (transformedCourse as any).groups = groupedItems;
      
      logger.debug('[CourseEditor] Loaded course with grouped items:', {
        totalItems: items.length,
        groups: groupedItems.map((g: any) => ({ id: g.id, name: g.name, itemCount: g.items.length }))
      });
      
      setCourse(transformedCourse as Course);
      setUnsavedItems(new Set());
      // Archived metadata fetch removed to avoid direct Supabase access in UI.
      setArchivedBanner(null);
      lastLoadedCourseIdRef.current = courseId;
    } catch (err) {
      logger.error('[CourseEditor] Failed to load course:', err);
      setError(err instanceof Error ? err.message : 'Failed to load course');
    } finally {
      inFlightLoadRef.current = false;
      setLoading(false);
    }
  }, [courseId]);

  // Load course on mount / when route changes.
  // IMPORTANT: include authLoading in deps; otherwise we can early-return while auth is loading
  // and never retry, leaving the editor stuck on "Loading course..." forever.
  useEffect(() => {
    if (!courseId) {
      setError('Missing courseId');
      setLoading(false);
      return;
    }

    // Admin guard: if user is not admin, bounce out quickly.
    // In dev-agent mode we treat the user as admin for preview stability.
    // IMPORTANT: don't redirect while auth is still loading.
    if (!isAdmin) {
      if (authLoading) return;
      setError('Admin access required');
      setLoading(false);
      navigate('/admin');
      return;
    }

    void loadCourse();
  }, [courseId, isAdmin, authLoading, navigate, loadCourse]);

  const getCurrentItem = (): CourseItem | null => {
    if (!course) return null;
    const group = (course as any).groups?.[activeGroupIndex];
    const item = group?.items?.[activeItemIndex] || null;
    
    // Debug log to see actual item structure (guarded by logger)
    if (item) {
      logger.debug('[CourseEditor] Current item structure:', {
        id: item.id,
        hasText: !!item.text,
        hasStem: !!item.stem,
        hasStemText: !!item.stem?.text,
        text: item.text,
        stemText: item.stem?.text,
        mode: item.mode,
        options: item.options,
      });
    }
    
    return item;
  };

  const handleItemChange = (updatedItem: CourseItem) => {
    if (!course) return;

    const updatedCourse = { ...course };
    const groups = (updatedCourse as any).groups || [];
    if (!groups[activeGroupIndex]?.items) return;

    groups[activeGroupIndex].items[activeItemIndex] = updatedItem;
    (updatedCourse as any).groups = groups;
    
    setCourse(updatedCourse);
    
    // Mark as unsaved
    const itemKey = `${activeGroupIndex}-${activeItemIndex}`;
    setUnsavedItems(prev => new Set(prev).add(itemKey));
  };

  const handleItemSelect = (groupIndex: number, itemIndex: number) => {
    setActiveGroupIndex(groupIndex);
    setActiveItemIndex(itemIndex);
    setActiveTab('stem');
  };

  const openStudyTextEditor = (index: number) => {
    if (!course) return;
    const st = ((course as any).studyTexts || [])[index];
    if (!st) {
      toast.error('Study text not found');
      return;
    }
    setStudyTextEditorIndex(index);
    setStudyTextEditorTitle(String(st.title ?? 'Study Text'));
    setStudyTextEditorDraft(String(st.content ?? ''));
    setStudyTextEditorLearningObjectives(Array.isArray(st.learningObjectives) ? st.learningObjectives.join(', ') : '');
    setStudyTextEditorOpen(true);
  };

  const commitStudyTextEditor = () => {
    if (!course) return;
    if (studyTextEditorIndex === null) return;

    const sts = [...(((course as any).studyTexts) || [])];
    const prev = sts[studyTextEditorIndex];
    if (!prev) {
      toast.error('Study text not found');
      return;
    }

    const nextTitle = String(studyTextEditorTitle || '').trim();
    if (!nextTitle) {
      toast.error('Title is required');
      return;
    }

    const loArr = String(studyTextEditorLearningObjectives || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    sts[studyTextEditorIndex] = {
      ...prev,
      title: nextTitle,
      content: studyTextEditorDraft,
      learningObjectives: loArr.length ? loArr : undefined,
    };
    setCourse({ ...(course as any), studyTexts: sts } as Course);
    setUnsavedItems((prevSet) => new Set(prevSet).add(`ST-${studyTextEditorIndex}`));
    setStudyTextEditorOpen(false);
    toast.success('Study text updated (unsaved)');
  };

  const appendStudyTextMarker = (marker: string) => {
    setStudyTextEditorDraft((prev) => {
      const base = String(prev || '');
      const sep = base.endsWith('\n') || base.length === 0 ? '' : '\n';
      return `${base}${sep}${marker}\n`;
    });
  };

  const findLastNonUrlImageMarker = (content: string) => {
    const re = /\[IMAGE:(.*?)\]/g;
    const matches: Array<{ start: number; end: number; token: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      matches.push({ start: m.index, end: re.lastIndex, token: String(m[1] ?? '').trim() });
    }
    const isUrl = (t: string) => /^https?:\/\//i.test(t) || t.startsWith('data:');
    for (let i = matches.length - 1; i >= 0; i--) {
      const tok = matches[i].token;
      if (tok && !isUrl(tok)) return matches[i];
    }
    return null;
  };

  const handleAIRewriteStudyText = async (
    styleHints?: Array<'simplify' | 'add_visual_cue' | 'more_formal' | 'more_casual' | 'add_context'>
  ) => {
    if (!course) return;
    if (studyTextEditorIndex === null) {
      toast.error('No study text selected');
      return;
    }
    const current = String(studyTextEditorDraft || '').trim();
    if (!current) {
      toast.error('No content to rewrite');
      return;
    }

    try {
      setStudyTextAiRewriteLoading(true);
      toast.info('Generating AI rewrite…');

      const title = String(studyTextEditorTitle || '').trim();
      const lo = String(studyTextEditorLearningObjectives || '').trim();

      const result = await mcp.rewriteText({
        segmentType: 'reference',
        currentText: current,
        styleHints,
        context: {
          subject: (course as any).subject || course.title,
          difficulty: 'intermediate',
          studyText: { title, learningObjectives: lo },
          guidance:
            'Rewrite this study text to be clearer, more engaging, and age-appropriate. ' +
            'CRITICAL: Preserve all markers like [SECTION:...] and [IMAGE:...] exactly (do not remove them). ' +
            'Do not output HTML; output plain text with the same marker structure.',
          course: {
            id: course.id,
            title: course.title,
            description: course.description,
            gradeBand: (course as any).gradeBand,
            subject: (course as any).subject,
          },
          audience: { gradeBand: (course as any).gradeBand },
          brandVoice: { tone: 'encouraging, clear, concise' },
        },
        candidateCount: 1,
      });

      const proposed = result?.candidates?.[0]?.text;
      if (!proposed) throw new Error('AI returned no rewrite');

      setCompareData({
        original: current,
        proposed,
        type: 'text',
        scope: 'studyText',
        studyTextIndex: studyTextEditorIndex,
      });
      setShowComparePanel(true);
    } catch (e) {
      console.error('[CourseEditor] StudyText rewrite failed:', e);
      toast.error(e instanceof Error ? e.message : 'AI rewrite failed');
    } finally {
      setStudyTextAiRewriteLoading(false);
    }
  };

  const handleAIImageForStudyText = async () => {
    if (!course) return;
    if (studyTextEditorIndex === null) {
      toast.error('No study text selected');
      return;
    }

    try {
      setStudyTextAiImageLoading(true);
      toast.info('Generating image…');

      const title = String(studyTextEditorTitle || '').trim();
      const lo = String(studyTextEditorLearningObjectives || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6)
        .join(', ');

      const raw = String(studyTextEditorDraft || '');
      const marker = findLastNonUrlImageMarker(raw);
      const markerPrompt = marker?.token || '';
      const firstSection = parseStudyText(raw)?.[0];
      const firstContext = firstSection?.content?.join(' ') || '';

      const subj = (course as any)?.subject || course?.title || 'General';
      const prompt = [
        `Simple learning visual for ${subj}.`,
        title ? `Study text: ${title}.` : '',
        lo ? `Learning objectives: ${lo}.` : '',
        markerPrompt ? `Image request: ${markerPrompt}.` : '',
        firstContext ? `Context: ${firstContext.slice(0, 220)}.` : '',
        `Create a clean photo or realistic illustration that helps students understand this concept.`,
        `IMPORTANT: Absolutely no text, letters, words, labels, numbers, or written language anywhere in the image.`,
        `No diagrams, charts, or infographics. Just a clean visual representation.`,
        `Original artwork only - no copyrighted characters or brands.`,
        `Colorful, friendly, child-appropriate educational style.`,
      ]
        .filter(Boolean)
        .join(' ');

      const res = await generateMedia({
        prompt,
        kind: 'image',
        options: { aspectRatio: '16:9', size: '1024x1024', quality: 'standard' },
      });

      setStudyTextEditorDraft((prev) => {
        const base = String(prev || '');
        if (marker) {
          return `${base.slice(0, marker.start)}[IMAGE:${res.url}]${base.slice(marker.end)}`;
        }
        const sep = base.endsWith('\n') || base.length === 0 ? '' : '\n';
        return `${base}${sep}[IMAGE:${res.url}]\n`;
      });

      toast.success('AI image inserted (remember to Save)');
    } catch (e) {
      console.error('[CourseEditor] StudyText image generation failed:', e);
      toast.error(e instanceof Error ? e.message : 'AI image generation failed');
    } finally {
      setStudyTextAiImageLoading(false);
    }
  };

  const generatePatchOps = (): PatchOperation[] => {
    if (!course || unsavedItems.size === 0) return [];

    const ops: PatchOperation[] = [];

    const hasStudyTextsFullReplace = unsavedItems.has('ST-ALL');
    if (hasStudyTextsFullReplace) {
      ops.push({
        op: 'replace',
        path: '/studyTexts',
        value: (course as any).studyTexts || [],
      });
    }

    unsavedItems.forEach(itemKey => {
      if (itemKey.startsWith('ST-')) {
        if (hasStudyTextsFullReplace) return;
        if (itemKey === 'ST-ALL') return;
        const idx = Number(itemKey.split('-')[1]);
        const st = (course as any).studyTexts?.[idx];
        if (st) {
          ops.push({ op: 'replace', path: `/studyTexts/${idx}`, value: st });
        }
        return;
      }

      const [groupIdx, itemIdx] = itemKey.split('-').map(Number);
      const group = (course as any).groups?.[groupIdx];
      const item = group?.items?.[itemIdx];

      if (item) {
        // Find the global item index in the course.items array
        let globalItemIndex = 0;
        for (let g = 0; g < groupIdx; g++) {
          globalItemIndex += ((course as any).groups[g]?.items?.length || 0);
        }
        globalItemIndex += itemIdx;

        // Replace the entire item
        ops.push({
          op: 'replace',
          path: `/items/${globalItemIndex}`,
          value: item,
        });
      }
    });

    return ops;
  };

  const handleSaveDraft = async () => {
    if (!course || !courseId || unsavedItems.size === 0) {
      toast.info('No changes to save');
      return;
    }

    try {
      setSaving(true);
      const ops = generatePatchOps();

      if (ops.length === 0) {
        toast.info('No changes to save');
        return;
      }

      console.log('[CourseEditor] Saving draft with ops:', ops);

      await mcp.updateCourse(courseId, ops);

      setUnsavedItems(new Set());
      setLastSavedAt(new Date().toLocaleTimeString());
      toast.success(`Draft saved (${ops.length} changes)`);
    } catch (err) {
      console.error('[CourseEditor] Save failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!course || !courseId) return;

    if (unsavedItems.size > 0) {
      toast.error('Please save all changes before publishing');
      return;
    }

    const changelog = prompt('Enter a brief description of changes:');
    if (!changelog) {
      return; // User cancelled
    }

    try {
      setSaving(true);
      toast.info('Publishing course...');
      const threshold = Number(orgThresholds.variantsCoverageMin ?? 0.9);
      const result = await publishing.publishWithPreflight(courseId, changelog, threshold);
      toast.success(`Course published as version ${result.version}`);
      navigate('/admin/courses/select');
    } catch (err) {
      console.error('[CourseEditor] Publish failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveCourse = async () => {
    if (!courseId) return;
    const reason = prompt('Reason for archiving (optional):') || undefined;
    try {
      await publishing.archiveCourse(courseId, reason);
      setArchivedBanner({ at: new Date().toISOString() });
      toast.success('Course archived');
      navigate('/admin/courses/select');
    } catch (e) {
      console.error('[CourseEditor] Archive failed:', e);
      toast.error(e instanceof Error ? e.message : 'Archive failed');
    }
  };

  const handleDeleteCourse = async () => {
    if (!courseId) return;
    const confirmText = prompt(`Type the course ID to confirm deletion:\n${courseId}`);
    if (!confirmText) return;
    if (confirmText.trim() !== courseId.trim()) {
      toast.error('Confirmation text does not match course ID');
      return;
    }
    try {
      await publishing.deleteCourse(courseId, confirmText.trim());
      toast.success('Course deleted');
      navigate('/admin/ai-pipeline');
    } catch (e) {
      console.error('[CourseEditor] Delete failed:', e);
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleDiscard = () => {
    if (!hasUnsavedChanges) return;

    if (confirm(`Discard ${unsavedItems.size} unsaved change(s)?`)) {
      loadCourse({ force: true });
    }
  };

  // AI Rewrite Handler
  const handleAIRewriteStem = async () => {
    const currentItem = getCurrentItem();
    if (!currentItem || !course) return;

    const stemText = (currentItem as any).stem?.text || currentItem.text || '';
    if (!stemText) {
      toast.error('No stem text to rewrite');
      return;
    }

    try {
      toast.info('Generating AI rewrite...');
      const optionsTexts = ((currentItem as any).options || []).map((o: any) => typeof o === 'string' ? o : (o?.text ?? ''));
const result = await mcp.rewriteText({
        segmentType: 'stem',
        currentText: stemText,
        context: {
          subject: (course as any).subject || course.title,
          difficulty: 'intermediate',
          mode: (currentItem as any).mode || 'options',
          options: optionsTexts,
          correctIndex: (currentItem as any).correctIndex ?? -1,
          guidance: 'Rewrite the question clearly without changing its meaning or the expected correct option/answer. Keep HTML only.',
          // Rich context
          course: { id: course.id, title: course.title, description: course.description, gradeBand: (course as any).gradeBand, subject: (course as any).subject },
          group: { name: (course as any).groups?.[activeGroupIndex]?.name },
          studyTexts: ((course as any).studyTexts || []).slice(0, 2).map((st: any) => ({ title: st.title, content: st.content, learningObjectives: st.learningObjectives })),
          adjacentItems: {
            prev: (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex - 1]?.stem?.text || (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex - 1]?.text || '',
            next: (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex + 1]?.stem?.text || (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex + 1]?.text || '',
          },
          audience: { gradeBand: (course as any).gradeBand },
          brandVoice: { tone: 'encouraging, clear, concise' },
        },
        candidateCount: 1,
      });

      if (result.candidates && result.candidates.length > 0) {
        const newText = result.candidates[0].text;
        const rationale = result.candidates[0].rationale;
        // Use compare overlay instead of confirm
        setCompareData({ original: stemText, proposed: newText, type: 'text', scope: 'stem' });
        setShowComparePanel(true);
      }
    } catch (error) {
      console.error('AI rewrite failed:', error);
      toast.error(error instanceof Error ? error.message : 'AI rewrite failed');
    }
  };

  // Group/Item actions
  const handleAddGroup = () => {
    if (!course) return;
    const groups = ((course as any).groups || []).map((g: any) => ({ ...g, items: [...(g.items||[])] }));
    const nextId = groups.reduce((m: number, g: any) => Math.max(m, Number(g.id || 0)), 0) + 1;
    groups.push({ id: nextId, name: `Group ${groups.length + 1}`, items: [] });
    setCourse({ ...(course as any), groups } as Course);
  };

  const handleAddItem = (groupIdx: number) => {
    if (!course) return;
    const groups = ((course as any).groups || []).map((g: any) => ({ ...g, items: [...(g.items||[])] }));
    const group = groups[groupIdx];
    if (!group) return;
    const allItems = groups.flatMap((g: any) => g.items || []);
    const nextId = allItems.reduce((m: number, it: any) => Math.max(m, Number(it.id || 0)), 0) + 1;
    const newItem: any = { id: nextId, groupId: group.id, mode: 'options', stem: { text: '' }, options: ['', ''], correctIndex: 0 };
    group.items.push(newItem);
    const updated = { ...(course as any), groups } as Course;
    setCourse(updated);
    const itemIndex = group.items.length - 1;
    setUnsavedItems(prev => new Set(prev).add(`${groupIdx}-${itemIndex}`));
  };

  const handleDuplicateItem = (groupIdx: number, itemIdx: number) => {
    if (!course) return;
    const groups = ((course as any).groups || []).map((g: any) => ({ ...g, items: [...(g.items||[])] }));
    const group = groups[groupIdx];
    const src = group?.items?.[itemIdx];
    if (!src) return;
    const allItems = groups.flatMap((g: any) => g.items || []);
    const nextId = allItems.reduce((m: number, it: any) => Math.max(m, Number(it.id || 0)), 0) + 1;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = nextId;
    group.items.splice(itemIdx + 1, 0, copy);
    setCourse({ ...(course as any), groups } as Course);
    setUnsavedItems(prev => new Set(prev).add(`${groupIdx}-${itemIdx + 1}`));
  };

  const handleDeleteItem = (groupIdx: number, itemIdx: number) => {
    if (!course) return;
    const groups = ((course as any).groups || []).map((g: any) => ({ ...g, items: [...(g.items||[])] }));
    const group = groups[groupIdx];
    if (!group) return;
    group.items.splice(itemIdx, 1);
    setCourse({ ...(course as any), groups } as Course);
    // Easiest: mark everything unsaved in that group to reshape positions
    const newUnsaved = new Set(unsavedItems);
    (group.items || []).forEach((_: any, idx: number) => newUnsaved.add(`${groupIdx}-${idx}`));
    setUnsavedItems(newUnsaved);
  };

  const handleMoveItem = (groupIdx: number, itemIdx: number, dir: -1 | 1) => {
    handleReorderItems(groupIdx, itemIdx, itemIdx + dir);
  };

  const handleReorderItems = (groupIdx: number, from: number, to: number) => {
    if (!course) return;
    const groups = ((course as any).groups || []).map((g: any) => ({ ...g, items: [...(g.items||[])] }));
    const group = groups[groupIdx];
    if (!group || to < 0 || to >= (group.items?.length || 0) || from === to) return;
    const [moved] = group.items.splice(from,1);
    group.items.splice(to,0,moved);
    setCourse({ ...(course as any), groups } as Course);
    const newUnsaved = new Set(unsavedItems);
    newUnsaved.add(`${groupIdx}-${from}`);
    newUnsaved.add(`${groupIdx}-${to}`);
    setUnsavedItems(newUnsaved);
  };

  const handleMoveGroup = (groupIdx: number, dir: -1 | 1) => {
    const j = groupIdx + dir;
    handleReorderGroups(groupIdx, j);
  };

  const handleReorderGroups = (from: number, to: number) => {
    if (!course) return;
    const groups = ((course as any).groups || []).map((g: any) => ({ ...g, items: [...(g.items||[])] }));
    if (to < 0 || to >= groups.length || from === to) return;
    const [moved] = groups.splice(from,1);
    groups.splice(to,0,moved);
    setCourse({ ...(course as any), groups } as Course);
    const newUnsaved = new Set(unsavedItems);
    groups.forEach((g:any, gi:number) => g.items?.forEach((_: any, ii:number) => newUnsaved.add(`${gi}-${ii}`)));
    setUnsavedItems(newUnsaved);
  };

  // Add Media Handler (simplified - direct upload)
  const handleAddMediaToStem = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,audio/*,video/*';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        toast.info('Uploading media...');
        
        // Upload via edge function (IgniteZero compliant)
        const path = `temp/${Date.now()}-${file.name}`;
        const result = await mcp.uploadMediaFile(file, path);

        if (!result.ok) throw new Error('Upload failed');

        // Add to item media
        const currentItem = getCurrentItem();
        if (!currentItem) return;

        const newMedia = {
          id: `media-${Date.now()}`,
          type: file.type.startsWith('image/') ? 'image' :
                file.type.startsWith('audio/') ? 'audio' : 'video',
          url: result.url,
          alt: file.name,
        };

        const existingMedia = (currentItem as any).stem?.media || (currentItem as any).stimulus?.media || [];
        const updatedItem = (currentItem as any).stem
          ? { ...currentItem, stem: { ...(currentItem as any).stem, media: [...existingMedia, newMedia] } }
          : { ...currentItem, stimulus: { ...currentItem.stimulus, media: [...existingMedia, newMedia] } };

        handleItemChange(updatedItem);
        toast.success('Media uploaded');
      } catch (error) {
        console.error('Upload failed:', error);
        toast.error(error instanceof Error ? error.message : 'Upload failed');
      }
    };

    input.click();
  };

  // Keyboard shortcuts (must be after handlers are defined)
  useKeyboardShortcuts({
    onSave: hasUnsavedChanges ? handleSaveDraft : undefined,
    onPublish: !hasUnsavedChanges ? handlePublish : undefined,
  });

  // Add Media from URL
  const handleAddMediaFromURL = (url: string, type: 'image' | 'audio' | 'video') => {
    const currentItem = getCurrentItem();
    if (!currentItem) return;

    const newMedia = {
      id: `media-${Date.now()}`,
      type,
      url,
      alt: url.split('/').pop() || 'Media from URL',
    };

    const existingMedia = (currentItem as any).stem?.media || (currentItem as any).stimulus?.media || [];
    const updatedItem = (currentItem as any).stem
      ? { ...currentItem, stem: { ...(currentItem as any).stem, media: [...existingMedia, newMedia] } }
      : { ...currentItem, stimulus: { ...currentItem.stimulus, media: [...existingMedia, newMedia] } };

    handleItemChange(updatedItem);
    toast.success('Media added from URL');
  };

  // Remove Media
  const handleRemoveMedia = (mediaId: string) => {
    const currentItem = getCurrentItem();
    if (!currentItem) return;

    if (!confirm('Remove this media?')) return;

    const existingMedia = (currentItem as any).stem?.media || (currentItem as any).stimulus?.media || [];
    const filtered = existingMedia.filter((m: any) => m.id !== mediaId);

    const updatedItem = (currentItem as any).stem
      ? { ...currentItem, stem: { ...(currentItem as any).stem, media: filtered } }
      : { ...currentItem, stimulus: { ...currentItem.stimulus, media: filtered } };

    handleItemChange(updatedItem);
    toast.success('Media removed');
  };

  // Replace Media
  const handleReplaceMedia = (mediaId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,audio/*,video/*';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        toast.info('Uploading replacement media...');
        
        const path = `temp/${Date.now()}-${file.name}`;
        const result = await mcp.uploadMediaFile(file, path);

        if (!result.ok) throw new Error('Upload failed');

        const currentItem = getCurrentItem();
        if (!currentItem) return;

        const existingMedia = (currentItem as any).stem?.media || (currentItem as any).stimulus?.media || [];
        const updated = existingMedia.map((m: any) => 
          m.id === mediaId 
            ? { 
                ...m, 
                url: result.url,
                alt: file.name,
                type: file.type.startsWith('image/') ? 'image' :
                      file.type.startsWith('audio/') ? 'audio' : 'video',
              }
            : m
        );

        const updatedItem = (currentItem as any).stem
          ? { ...currentItem, stem: { ...(currentItem as any).stem, media: updated } }
          : { ...currentItem, stimulus: { ...currentItem.stimulus, media: updated } };

        handleItemChange(updatedItem);
        toast.success('Media replaced');
      } catch (error) {
        console.error('Replace failed:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to replace media');
      }
    };

    input.click();
  };

  // AI Rewrite for Reference
  const handleAIRewriteReference = async () => {
    const currentItem = getCurrentItem();
    if (!currentItem || !course) return;

    const refText = (currentItem as any).reference?.html || (currentItem as any).referenceHtml || currentItem.explain || '';
    if (!refText) {
      toast.error('No reference text to rewrite');
      return;
    }

    try {
      toast.info('Generating AI rewrite...');
      const stemText = (currentItem as any).stem?.text || (currentItem as any).text || '';
      const optionsTexts = ((currentItem as any).options || []).map((o: any) => typeof o === 'string' ? o : (o?.text ?? ''));
const result = await mcp.rewriteText({
        segmentType: 'reference',
        currentText: refText,
        context: {
          subject: (course as any).subject || course.title,
          difficulty: 'intermediate',
          stem: stemText,
          options: optionsTexts,
          guidance: 'Rewrite the explanation to match the question and options. Keep concepts consistent; output HTML only.',
          course: { id: course.id, title: course.title, description: course.description, gradeBand: (course as any).gradeBand, subject: (course as any).subject },
          group: { name: (course as any).groups?.[activeGroupIndex]?.name },
          studyTexts: ((course as any).studyTexts || []).slice(0, 2).map((st: any) => ({ title: st.title, content: st.content, learningObjectives: st.learningObjectives })),
          adjacentItems: {
            prev: (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex - 1]?.stem?.text || (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex - 1]?.text || '',
            next: (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex + 1]?.stem?.text || (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex + 1]?.text || '',
          },
          audience: { gradeBand: (course as any).gradeBand },
          brandVoice: { tone: 'encouraging, clear, concise' },
        },
        candidateCount: 1,
      });

      if (result.candidates && result.candidates.length > 0) {
        const newText = result.candidates[0].text;
        const rationale = result.candidates[0].rationale;
        setCompareData({ original: refText, proposed: newText, type: 'text', scope: 'reference' });
        setShowComparePanel(true);
      }
    } catch (error) {
      console.error('AI rewrite failed:', error);
      toast.error(error instanceof Error ? error.message : 'AI rewrite failed');
    }
  };

  // AI Rewrite for Options
  const handleAIRewriteOption = async (index: number) => {
    const currentItem = getCurrentItem();
    if (!currentItem || !course) return;

    const options = currentItem.options || (currentItem as any).choices || [];
    if (!options[index]) {
      toast.error('Option not found');
      return;
    }

    const optionText = typeof options[index] === 'string' 
      ? options[index] 
      : options[index].text || '';

    try {
      toast.info(`Rewriting option ${index + 1}...`);
const result = await mcp.rewriteText({
        segmentType: 'option',
        currentText: optionText,
        context: {
          subject: (course as any).subject || course.title,
          difficulty: 'intermediate',
          stem: (currentItem as any).stem?.text || (currentItem as any).text || '',
          options: options.map((o: any) => typeof o === 'string' ? o : (o?.text ?? '')),
          optionIndex: index,
          correctIndex: (currentItem as any).correctIndex ?? -1,
          role: ((currentItem as any).correctIndex ?? -1) === index ? 'correct' : 'distractor',
          guidance: 'Preserve the role of this option. If distractor, keep it plausible but not the correct answer. Avoid duplicating other options. Output HTML only.',
          course: { id: course.id, title: course.title, description: course.description, gradeBand: (course as any).gradeBand, subject: (course as any).subject },
          group: { name: (course as any).groups?.[activeGroupIndex]?.name },
          studyTexts: ((course as any).studyTexts || []).slice(0, 2).map((st: any) => ({ title: st.title, content: st.content, learningObjectives: st.learningObjectives })),
          adjacentItems: {
            prev: (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex - 1]?.stem?.text || (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex - 1]?.text || '',
            next: (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex + 1]?.stem?.text || (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex + 1]?.text || '',
          },
          audience: { gradeBand: (course as any).gradeBand },
          brandVoice: { tone: 'encouraging, clear, concise' },
        },
        candidateCount: 1,
      });

      if (result.candidates && result.candidates.length > 0) {
        const newText = result.candidates[0].text;
        setCompareData({ original: optionText, proposed: newText, type: 'text', scope: 'option', optionIndex: index });
        setShowComparePanel(true);
      }
    } catch (error) {
      console.error('AI rewrite failed:', error);
      toast.error(error instanceof Error ? error.message : 'AI rewrite failed');
    }
  };

  // Add Media to Option
  const handleAddMediaToOption = (index: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,audio/*,video/*';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        toast.info(`Uploading media for option ${index + 1}...`);
        
        const path = `temp/${Date.now()}-${file.name}`;
        const uploadResult = await mcp.uploadMediaFile(file, path);

        if (!uploadResult.ok) throw new Error('Upload failed');

        const currentItem = getCurrentItem();
        if (!currentItem) return;

        const newMedia = {
          type: file.type.startsWith('image/') ? 'image' :
                file.type.startsWith('audio/') ? 'audio' : 'video',
          url: uploadResult.url,
          alt: file.name,
        };

        // Update optionMedia array
        const existingOptionMedia = (currentItem as any).optionMedia || [];
        const updatedOptionMedia = [...existingOptionMedia];
        updatedOptionMedia[index] = newMedia;

        const updatedItem = { ...currentItem, optionMedia: updatedOptionMedia };
        handleItemChange(updatedItem);
        toast.success(`Media uploaded for option ${index + 1}`);
      } catch (error) {
        console.error('Upload failed:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to upload media');
      }
    };

    input.click();
  };

  // Handle media library selection
  const handleMediaLibrarySelect = (assets: any[]) => {
    const currentItem = getCurrentItem();
    if (!currentItem || assets.length === 0) return;

    const newMediaItems = assets.map(asset => ({
      id: asset.id,
      type: asset.mime_type?.startsWith('image/') ? 'image' :
            asset.mime_type?.startsWith('audio/') ? 'audio' : 'video',
      url: asset.public_url,
      alt: asset.alt_text || asset.filename,
    }));

    let updatedItem = { ...currentItem } as any;

    if (mediaInsertTarget.scope === 'stem') {
      const existingMedia = (currentItem as any).stem?.media || (currentItem as any).stimulus?.media || [];
      updatedItem = (currentItem as any).stem
        ? { ...currentItem, stem: { ...(currentItem as any).stem, media: [...existingMedia, ...newMediaItems] } }
        : { ...currentItem, stimulus: { ...currentItem.stimulus, media: [...existingMedia, ...newMediaItems] } };
    } else if (mediaInsertTarget.scope === 'option' && typeof mediaInsertTarget.optionIndex === 'number') {
      // Single media per option (use first selected asset)
      const idx = mediaInsertTarget.optionIndex;
      const optionAsset = newMediaItems[0];
      const existingOptionMedia = (currentItem as any).optionMedia || [];
      const updatedOptionMedia = [...existingOptionMedia];
      updatedOptionMedia[idx] = optionAsset;
      updatedItem = { ...currentItem, optionMedia: updatedOptionMedia };
    }

    handleItemChange(updatedItem);
    setShowMediaLibrary(false);
    toast.success(`Added ${assets.length} media item(s) from library`);
  };

  // Handle comparison panel actions
  const handleAdoptComparison = () => {
    if (!compareData) return;

    if (compareData.type === 'text') {
      if (compareData.scope === 'studyText') {
        setStudyTextEditorDraft(compareData.proposed);
        setShowComparePanel(false);
        setCompareData(null);
        toast.success('Applied AI suggestion (remember to Save)');
        return;
      }

      const currentItem = getCurrentItem();
      if (!currentItem) return;

      if (compareData.scope === 'stem') {
        const updatedItem = (currentItem as any).stem
          ? { ...currentItem, stem: { ...(currentItem as any).stem, text: compareData.proposed } }
          : { ...currentItem, text: compareData.proposed };
        handleItemChange(updatedItem);
      } else if (compareData.scope === 'reference') {
        const updatedItem = (currentItem as any).reference
          ? { ...currentItem, reference: { ...(currentItem as any).reference, html: compareData.proposed } }
          : (currentItem as any).referenceHtml !== undefined
            ? { ...currentItem, referenceHtml: compareData.proposed }
            : { ...currentItem, explain: compareData.proposed };
        handleItemChange(updatedItem);
      } else if (compareData.scope === 'option' && typeof compareData.optionIndex === 'number') {
        const options = (currentItem as any).options || [];
        const newOptions = [...options];
        newOptions[compareData.optionIndex] = typeof options[compareData.optionIndex] === 'string'
          ? compareData.proposed
          : { ...options[compareData.optionIndex], text: compareData.proposed };
        const updatedItem = { ...currentItem, options: newOptions };
        handleItemChange(updatedItem);
      }
    }

    setShowComparePanel(false);
    setCompareData(null);
    toast.success('Applied AI suggestion');
  };

  const handleRejectComparison = () => {
    setShowComparePanel(false);
    setCompareData(null);
    toast.info('Kept original text');
  };

  // Preview latest job result via dryRun and show DiffViewer
  const previewJobResultDryRun = async (jobId: string) => {
    if (!courseId) return;
    try {
      // Fetch job details to extract mergePlan/attachments
      const jobJson = await mcp.callGet<any>('lms.getJob', { id: jobId });
      
      const mergePlan = jobJson?.result?.mergePlan || jobJson?.payload?.mergePlan || undefined;
      const attachments = jobJson?.result?.attachments || jobJson?.payload?.attachments || undefined;
      if (!mergePlan && !attachments) {
        toast.info('Job completed but no merge plan or attachments to preview.');
        return;
      }
      // Ask server to compute preview (no persistence)
      const applyJson = await mcp.call<any>('lms.applyJobResult', {
        jobId,
        courseId,
        mergePlan,
        attachments,
        dryRun: true,
      });
      
      if (!applyJson?.ok) {
        throw new Error(applyJson?.error || 'Preview failed');
      }
      const diff = Array.isArray(applyJson?.preview?.diff) ? applyJson.preview.diff : (mergePlan?.patch || []);
      setDiffOps(diff);
      setShowDiffViewer(true);
    } catch (e) {
      console.error('[CourseEditor] Preview failed:', e);
      toast.error(e instanceof Error ? e.message : 'Failed to preview changes');
    }
  };

  // Approve: apply result for real (persist), invalidate cache, reload course
  const approveApplyJobResult = async () => {
    if (!courseId || !coPilotJobId) {
      setShowDiffViewer(false);
      return;
    }
    try {
      setApproving(true);
      if (coPilotJobId === '__editor_repair__') {
        const json = await mcp.call<any>('lms.editorRepairCourse', { courseId, apply: true });
        if (!json?.ok) throw new Error(json?.error || 'Apply failed');
      } else if (coPilotJobId === '__editor_variants_audit__') {
        const json = await mcp.call<any>('lms.editorVariantsAudit', { courseId, apply: true });
        if (!json?.ok) throw new Error(json?.error || 'Apply failed');
      } else if (coPilotJobId === '__editor_variants_missing__') {
        const json = await mcp.call<any>('lms.editorVariantsMissing', { courseId, apply: true });
        if (!json?.ok) throw new Error(json?.error || 'Apply failed');
      } else if (coPilotJobId === '__editor_autofix__') {
        try {
          await variants.autoFix(courseId);
        } catch (e: any) {
          if (e.message === '403') {
            toast.info('Enable Option B to apply Auto‑Fix');
            setShowDiffViewer(false);
            setDiffOps([]);
            return;
          }
          throw e;
        }
      } else {
        // Re-fetch job to ensure latest mergePlan/attachments
        const jobJson = await mcp.callGet<any>('lms.getJob', { id: coPilotJobId });
        const mergePlan = jobJson?.result?.mergePlan || jobJson?.payload?.mergePlan || undefined;
        const attachments = jobJson?.result?.attachments || jobJson?.payload?.attachments || undefined;
        
        const applyJson = await mcp.call<any>('lms.applyJobResult', {
          jobId: coPilotJobId,
          courseId,
          mergePlan,
          attachments,
          description: 'Applied AI result from Co‑Pilot',
        });
        
        if (!applyJson?.ok) {
          throw new Error(applyJson?.error || 'Apply failed');
        }
      }
      toast.success('Changes applied');
      setShowDiffViewer(false);
      setDiffOps([]);
      await invalidateCourseCache(courseId);
      await loadCourse();
    } catch (e) {
      console.error('[CourseEditor] Apply failed:', e);
      toast.error(e instanceof Error ? e.message : 'Failed to apply changes');
    } finally {
      setApproving(false);
    }
  };

  // Adopt Generated Exercises
  const handleAdoptExercises = (exercises: any[]) => {
    if (!course) return;

    try {
      // Destination: last group (or create virtual group 1 if none)
      const groups = ((course as any).groups || []).map((g: any) => ({ ...g, items: [...(g.items || [])] }));
      const destGroupIndex = groups.length > 0 ? groups.length - 1 : 0;
      if (groups.length === 0) {
        groups.push({ id: 1, name: 'Group 1', items: [] });
      }
      const destItems = groups[destGroupIndex].items;
      const startIdx = destItems.length;

      const newItemsWithIds = exercises.map((ex, idx) => ({
        ...ex,
        id: (course as any).items?.length ? (course as any).items.length + idx + 1 : idx + 1,
        groupId: groups[destGroupIndex].id,
      }));

      // Push into grouped structure for editor
      newItemsWithIds.forEach((ni) => destItems.push(ni));

      const updatedCourse = {
        ...course,
        groups,
        // maintain items list for completeness
        items: ([...(((course as any).items) || []), ...newItemsWithIds]),
      } as any;

      setCourse(updatedCourse as Course);
      
      // Mark the newly inserted positions as unsaved using groupIndex-itemIndex keys
      const newUnsaved = new Set(unsavedItems);
      for (let i = 0; i < newItemsWithIds.length; i++) {
        const itemIndex = startIdx + i;
        newUnsaved.add(`${destGroupIndex}-${itemIndex}`);
      }
      setUnsavedItems(newUnsaved);

      toast.success(`Adopted ${exercises.length} exercise(s) - remember to Save Draft`);
    } catch (error) {
      console.error('Failed to adopt exercises:', error);
      toast.error('Failed to adopt exercises');
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-lg">Loading course...</span>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center justify-center h-screen">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Failed to load course</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <div className="flex gap-3">
            <Button onClick={() => navigate('/admin/courses/select')}>Back to Course Selector</Button>
            <Button variant="outline" onClick={() => navigate('/admin')}>Back to Admin</Button>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (!course) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-screen">
          <p>No course data</p>
        </div>
      </PageContainer>
    );
  }

  const currentItem = getCurrentItem();
  const groups = (course as any).groups || [];

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top Navbar */}
      <div className="flex items-center justify-between py-3 px-6 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Course Editor</span>
            <span>›</span>
            <strong className="text-foreground">{course.title || courseId}</strong>
            {lastSavedAt && (
              <span className="ml-3 text-xs text-muted-foreground">Last saved {lastSavedAt}</span>
            )}
          </div>
          {hasUnsavedChanges && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold">
              ● {unsavedItems.size} unsaved change{unsavedItems.size > 1 ? 's' : ''}
            </span>
          )}
          {archivedBanner && (
            <span className="ml-2 px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
              Archived on {new Date(archivedBanner.at).toLocaleString()}
            </span>
          )}
        </div>

        <div className="flex gap-3 items-center">
          {/* Media insert target selector */}
          <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
            <span>Insert to:</span>
            <select
              className="px-2 py-1 border rounded bg-background"
              value={mediaInsertTarget.scope === 'stem' ? 'stem' : `option-${mediaInsertTarget.optionIndex ?? 0}`}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'stem') {
                  setMediaInsertTarget({ scope: 'stem' });
                } else if (v.startsWith('option-')) {
                  const idx = Number(v.split('-')[1] || 0);
                  setMediaInsertTarget({ scope: 'option', optionIndex: idx });
                }
              }}
            >
              <option value="stem">Stem</option>
              {(() => {
                const opts = (getCurrentItem() as any)?.options || [];
                return opts.map((_: any, i: number) => (
                  <option key={i} value={`option-${i}`}>Option {String.fromCharCode(65 + i)}</option>
                ));
              })()}
            </select>
          </div>

          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowMediaLibrary(!showMediaLibrary)}
          >
            {showMediaLibrary ? '✕ Close' : '📁 Media Library'}
          </Button>
          <Button variant="ghost" onClick={handleDiscard} disabled={!hasUnsavedChanges}>
            Discard
          </Button>
          <Button 
            variant="outline" 
            onClick={handleSaveDraft} 
            disabled={!hasUnsavedChanges || saving}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>💾 Save Draft</>
            )}
          </Button>
          {/* Publish should only be possible when everything is saved (no unsaved changes). */}
          <Button onClick={handlePublish} disabled={hasUnsavedChanges || saving} data-testid="btn-publish">
            🚀 Publish
          </Button>
          {/* Self-heal / Variants Automation */}
          <Button
            variant="outline"
            data-testid="btn-repair"
            onClick={async () => {
              if (!courseId) return;
              try {
                const diff = await variants.repairPreview(courseId);
                if (!Array.isArray(diff) || diff.length === 0) {
                  toast.info('Repair found nothing to change');
                  return;
                }
                setDiffOps(diff);
                setAuditInfo(null);
                setShowDiffViewer(true);
                setCoPilotJobId('__editor_repair__');
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Repair failed');
              }
            }}
          >
            🛠️ Repair Course
          </Button>
          <Button
            variant="outline"
            data-testid="btn-variants-audit"
            onClick={async () => {
              if (!courseId) return;
              // Open the diff viewer immediately so the user sees feedback even if the backend is slow.
              setDiffOps([]);
              setAuditInfo(null);
              setShowDiffViewer(true);
              setCoPilotJobId('__editor_variants_audit__');
              try {
                const result = await variants.variantsAudit(courseId);
                setDiffOps(result.diff);
                setAuditInfo(result.report || null);
                if (result.report) console.log('[Variants Audit] report:', result.report);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Variants audit failed');
              }
            }}
          >
            🔍 Audit Variants
          </Button>
          <Button
            variant="outline"
            data-testid="btn-variants-missing"
            onClick={async () => {
              if (!courseId) return;
              try {
                const diff = await variants.variantsMissing(courseId);
                if (!Array.isArray(diff) || diff.length === 0) {
                  toast.info('No missing variants were generated in this pass');
                }
                setDiffOps(diff);
                setAuditInfo(null);
                setShowDiffViewer(true);
                setCoPilotJobId('__editor_variants_missing__');
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Generate missing variants failed');
              }
            }}
          >
            ➕ Generate Missing Variants
          </Button>

          {/* Archive/Delete actions */}
          <Button variant="outline" onClick={handleArchiveCourse}>
            🗄️ Archive
          </Button>
          <Button variant="destructive" onClick={handleDeleteCourse}>
            🗑️ Delete
          </Button>

          {/* Co‑Pilot actions */}
          <Button
            variant="outline"
            data-testid="btn-copilot-variants"
            onClick={async () => {
              try {
                const subject = (course as any).subject || course.title || (courseId ?? 'Untitled');
                const jobId = await copilot.startVariants(courseId || '', subject);
                toast.success(`Co‑Pilot started (variants). Job: ${jobId}`);
                setCoPilotJobId(jobId);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Co‑Pilot failed');
              }
            }}
          >
            🤖 Variants
          </Button>
          <Button
            variant="outline"
            data-testid="btn-copilot-enrich"
            onClick={async () => {
              try {
                const subject = (course as any).subject || course.title || (courseId ?? 'Untitled');
                const jobId = await copilot.startEnrich(courseId || '', subject);
                toast.success(`Co‑Pilot started (enrich). Job: ${jobId}`);
                setCoPilotJobId(jobId);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Co‑Pilot failed');
              }
            }}
          >
            ✨ Enrich
          </Button>
          <Button
            variant="outline"
            data-testid="btn-localize"
            onClick={async () => {
              try {
                const subject = (course as any).subject || course.title || (courseId ?? 'Untitled');
                const locale = prompt('Target locale (e.g., es-419, fr-FR)?') || 'es-419';
                const jobId = await copilot.startLocalize(courseId || '', subject, locale);
                toast.success(`Co‑Pilot started (localize ${locale}). Job: ${jobId}`);
                setCoPilotJobId(jobId);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Co‑Pilot failed');
              }
            }}
          >
            🌐 Localize
          </Button>
          {coPilotJobId && (
            <div className="flex items-center gap-2">
              <JobProgress jobId={coPilotJobId} onDone={(final) => {
                if (final === 'done' && coPilotJobId) {
                  // Attempt dry-run preview if job produced a mergePlan/attachments
                  previewJobResultDryRun(coPilotJobId);
                }
              }} />
              <Link
                to={`/admin/jobs?jobId=${encodeURIComponent(coPilotJobId)}`}
                className="text-sm underline text-primary"
                title="Open in Jobs Dashboard"
              >
                View job
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Top-Level Tabs: Exercises | Study Texts */}
      <div className="border-b border-gray-200 bg-white px-6">
        <div className="flex gap-1">
          <button
            onClick={() => setTopLevelTab('exercises')}
            className={`px-6 py-3 border-b-2 font-medium text-sm transition-colors ${
              topLevelTab === 'exercises'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            📝 Exercises
          </button>
          <button
            onClick={() => setTopLevelTab('studyTexts')}
            className={`px-6 py-3 border-b-2 font-medium text-sm transition-colors ${
              topLevelTab === 'studyTexts'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            📚 Study Texts
          </button>
        </div>
      </div>

      {/* Main Editor Layout */}
      <div className="flex-1 flex overflow-hidden">
        {topLevelTab === 'exercises' && (
          <>
            {/* Left: Navigator */}
            <div className="w-64 flex-shrink-0">
              <Navigator
                course={course}
                activeGroupIndex={activeGroupIndex}
                activeItemIndex={activeItemIndex}
                onItemSelect={handleItemSelect}
                unsavedItems={unsavedItems}
                onAddGroup={() => handleAddGroup()}
                onAddItem={(g) => handleAddItem(g)}
                onDuplicateItem={(g,i) => handleDuplicateItem(g,i)}
                onDeleteItem={(g,i) => handleDeleteItem(g,i)}
                onMoveGroup={(g,dir) => handleMoveGroup(g,dir)}
                onMoveItem={(g,i,dir) => handleMoveItem(g,i,dir)}
                onReorderGroups={(from,to) => handleReorderGroups(from,to)}
                onReorderItems={(g,from,to) => handleReorderItems(g,from,to)}
              />
            </div>

        {/* Center: Item Editor */}
        <div className="flex-1 overflow-auto bg-gray-50">
          {currentItem ? (
            <div className="max-w-4xl mx-auto p-6">
              {/* Item Header */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Item {currentItem.id} 
                      <span className="text-muted-foreground ml-2">
                        ({groups[activeGroupIndex]?.name || `Group ${activeGroupIndex + 1}`})
                      </span>
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-3">
                      <span>Mode:</span>
                      <select
                        className="px-2 py-1 border rounded text-foreground bg-background"
                        value={currentItem.mode || 'options'}
                        onChange={(e) => {
                          const nextMode = e.target.value as 'options' | 'numeric';
                          let updated = { ...currentItem } as any;
                          if (nextMode === 'numeric') {
                            updated = { ...updated, mode: 'numeric', answer: typeof updated.answer === 'number' ? updated.answer : 0 };
                          } else {
                            updated = { ...updated, mode: 'options', options: Array.isArray(updated.options) && updated.options.length > 0 ? updated.options : ['', ''], correctIndex: typeof updated.correctIndex === 'number' ? updated.correctIndex : 0 };
                          }
                          handleItemChange(updated);
                        }}
                      >
                        <option value="options">options</option>
                        <option value="numeric">numeric</option>
                      </select>
                      {currentItem.clusterId && (
                        <span className="ml-1">Cluster: <span className="font-medium">{currentItem.clusterId}</span></span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const hasImage = (() => {
                        const key = `item:${currentItem.id}:stem`;
                        const imgMap = (course as any)?.images?.[key];
                        if (Array.isArray(imgMap) && imgMap.length > 0) return true;
                        const media = (currentItem as any)?.stem?.media || (currentItem as any)?.stimulus?.media || [];
                        return Array.isArray(media) && media.some((m: any) => (m?.type || '').startsWith('image'));
                      })();
                      return !hasImage ? (
                        <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-xs">🖼️ Missing image</span>
                      ) : null;
                    })()}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (!courseId) return;
                        const item = getCurrentItem() as any;
                        if (!item) return;
                        try {
                          const stemText = item?.stem?.text || item?.text || '';
                          const prompt = stemText ? `Generate an illustrative image: ${stemText}` : `Generate an illustrative image for item ${item.id}`;
                          
                          const json = await mcp.call<any>('lms.enqueueCourseMedia', {
                            courseId,
                            itemId: item.id,
                            prompt,
                            style: 'clean-diagram',
                          });
                          
                          const jid = String(json?.jobId || json?.mediaJobId || json?.id || '');
                          
                          if (jid) {
                            setCoPilotJobId(jid);
                            toast.success(`Image generation started. Job ${jid}`);
                          } else {
                            toast.info('Image job enqueued.');
                          }
                        } catch (e) {
                          console.error('[CourseEditor] enqueue image failed:', e);
                          toast.error(e instanceof Error ? e.message : 'Failed to start image job');
                        }
                      }}
                    >
                      🖼️ Add Image (AI)
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (!courseId) return;
                        try {
                          const json = await mcp.call<any>('lms.enqueueCourseMissingImages', { courseId, limit: 25 });
                          const n = Number(json?.enqueued ?? json?.count ?? 0);
                          toast.success(`Enqueued ${n} image job(s) for missing items`);
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'Failed to enqueue missing images');
                        }
                      }}
                    >
                      🧩 Fix Missing Images (AI)
                    </Button>
                  </div>
                </div>
              </div>
              {/* Audit Panel */}
              {auditInfo && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Audit</div>
                    <div className="text-sm text-muted-foreground">
                      Coverage: {Math.round((auditInfo.coverage ?? 0) * 100)}% (min {Math.round((orgThresholds.variantsCoverageMin ?? 0.9) * 100)}%)
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Use “🛠️ Repair Course” or “➕ Generate Missing Variants” to improve coverage before publishing.
                  </div>
                </div>
              )}

              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="border-b border-gray-200 px-4">
                  <TabsList className="bg-transparent">
                    <TabsTrigger value="stem">Stem</TabsTrigger>
                    <TabsTrigger value="options">Options</TabsTrigger>
                    <TabsTrigger value="reference">Explanation</TabsTrigger>
                    <TabsTrigger value="exercises">New Exercises</TabsTrigger>
                  </TabsList>
                </div>

                <div className="p-6">
                  <TabsContent value="stem" className="mt-0">
<StemTab
                      item={currentItem}
                      onChange={handleItemChange}
                      onAIRewrite={handleAIRewriteStem}
                      onOpenAIChat={() => { setChatTarget({ segment: 'stem' }); setShowRewriteChat(true); }}
                      onAddMedia={handleAddMediaToStem}
                      onFromURL={handleAddMediaFromURL}
                      onRemoveMedia={handleRemoveMedia}
                      onReplaceMedia={handleReplaceMedia}
                      courseId={courseId || ''}
                      course={course}
                    />
                  </TabsContent>

                  <TabsContent value="options" className="mt-0">
<OptionsTab
                      item={currentItem}
                      onChange={handleItemChange}
                      onAIRewrite={handleAIRewriteOption}
                      onOpenAIChatOption={(idx) => { setChatTarget({ segment: 'option', optionIndex: idx }); setShowRewriteChat(true); }}
                      onAddMedia={handleAddMediaToOption}
                      onRemoveOptionMedia={(idx) => {
                        const it = getCurrentItem() as any;
                        if (!it) return;
                        const optionMedia = [...(it.optionMedia || [])];
                        optionMedia[idx] = null;
                        const updated = { ...it, optionMedia };
                        handleItemChange(updated);
                      }}
                      courseId={courseId || ''}
                      course={course}
                    />
                  </TabsContent>

                  <TabsContent value="reference" className="mt-0">
                    <ReferenceTab
                      item={currentItem}
                      onChange={handleItemChange}
                      onAIRewrite={handleAIRewriteReference}
                    />
                  </TabsContent>

                  <TabsContent value="exercises" className="mt-0">
                    <ExercisesTab
                      courseId={courseId || ''}
                      onAdopt={handleAdoptExercises}
                    />
                  </TabsContent>
                </div>
              </Tabs>

              {/* Mobile/Tablet live preview */}
              <div className="mt-6 xl:hidden">
                <ItemPreview item={currentItem as any} courseTitle={course?.title} />
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <p>Select an item to edit</p>
            </div>
          )}
        </div>

            {/* Right: Live Preview */}
            <div className="hidden xl:block w-[460px] flex-shrink-0 overflow-auto bg-gray-50 border-l">
              <div className="p-4">
                {currentItem ? (
                  <ItemPreview item={currentItem as any} courseTitle={course?.title} />
                ) : (
                  <div className="text-sm text-muted-foreground p-4">Select an item to see preview</div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Study Texts Tab */}
        {topLevelTab === 'studyTexts' && (
          <div className="flex-1 overflow-auto bg-gray-50 p-6">
            <div className="max-w-5xl mx-auto">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-semibold mb-4">Study Texts</h2>
                <p className="text-muted-foreground mb-6">
                  Course-level reference content and learning materials.
                </p>
                
                {/* Study Texts List */}
                <div className="space-y-3">
                  {((course as any).studyTexts || []).map((studyText: any, index: number) => (
                    <div
                      key={studyText.id || index}
                      className="border border-gray-200 rounded-lg p-4 hover:border-primary transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold">{studyText.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {studyText.content?.substring(0, 150)}...
                          </p>
                          {studyText.learningObjectives && (
                            <div className="flex gap-2 mt-2">
                              {studyText.learningObjectives.map((obj: string) => (
                                <span key={obj} className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded">
                                  {obj}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          data-cta-id={`cta-studytext-edit-${index}`}
                          data-action="open_modal"
                          onClick={() => openStudyTextEditor(index)}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  ))}
                  
                  {((course as any).studyTexts || []).length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      No study texts yet. Click "Add Study Text" to create one.
                    </div>
                  )}
                </div>

                <Button
                  className="w-full mt-6"
                  data-cta-id="cta-studytext-add"
                  data-action="action"
                  onClick={() => {
                    if (!course) return;
                    const sts = [...(((course as any).studyTexts) || [])];
                    const nextIndex = sts.length;
                    sts.push({
                      id: `study-text-${Date.now()}`,
                      title: 'New Study Text',
                      content: '[SECTION:Introduction]\nEnter your content here...',
                    });
                    setCourse({ ...(course as any), studyTexts: sts } as Course);
                    // Full replace so add/remove/reorder can be saved safely
                    setUnsavedItems((prev) => new Set(prev).add('ST-ALL'));
                    openStudyTextEditor(nextIndex);
                  }}
                >
                  + Add Study Text
                </Button>

                <Dialog open={studyTextEditorOpen} onOpenChange={setStudyTextEditorOpen}>
                  <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>Edit Study Text</DialogTitle>
                      <DialogDescription>
                        Edit the raw content. Markers like <code>[SECTION:Title]</code> are supported.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="studytext-title">Title</Label>
                        <Input
                          id="studytext-title"
                          value={studyTextEditorTitle}
                          onChange={(e) => setStudyTextEditorTitle(e.target.value)}
                          placeholder="Study text title"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="studytext-learning-objectives">Learning Objectives (comma-separated)</Label>
                        <Input
                          id="studytext-learning-objectives"
                          value={studyTextEditorLearningObjectives}
                          onChange={(e) => setStudyTextEditorLearningObjectives(e.target.value)}
                          placeholder="LO-01, LO-02"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="studytext-content">Content</Label>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            data-cta-id="cta-studytext-marker-section"
                            data-action="action"
                            onClick={() => appendStudyTextMarker('[SECTION:New Section Title]')}
                          >
                            + [SECTION:]
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            data-cta-id="cta-studytext-marker-image"
                            data-action="action"
                            onClick={() => appendStudyTextMarker('[IMAGE:Describe the image you want]')}
                          >
                            + [IMAGE:]
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            data-cta-id="cta-studytext-ai-rewrite"
                            data-action="action"
                            disabled={studyTextAiRewriteLoading}
                            onClick={() => handleAIRewriteStudyText()}
                            className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 hover:from-purple-100 hover:to-pink-100"
                          >
                            <Sparkles className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
                            <span className="text-purple-700">{studyTextAiRewriteLoading ? 'Rewriting…' : 'AI Rewrite'}</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            data-cta-id="cta-studytext-ai-simplify"
                            data-action="action"
                            disabled={studyTextAiRewriteLoading}
                            onClick={() => handleAIRewriteStudyText(['simplify'])}
                          >
                            Simplify
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            data-cta-id="cta-studytext-ai-add-context"
                            data-action="action"
                            disabled={studyTextAiRewriteLoading}
                            onClick={() => handleAIRewriteStudyText(['add_context'])}
                          >
                            Add Context
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            data-cta-id="cta-studytext-ai-image"
                            data-action="action"
                            disabled={studyTextAiImageLoading}
                            onClick={handleAIImageForStudyText}
                            className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 hover:from-purple-100 hover:to-pink-100"
                          >
                            <Sparkles className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
                            <span className="text-purple-700">{studyTextAiImageLoading ? 'Generating…' : 'AI Image'}</span>
                          </Button>
                        </div>

                        <Textarea
                          id="studytext-content"
                          value={studyTextEditorDraft}
                          onChange={(e) => setStudyTextEditorDraft(e.target.value)}
                          rows={14}
                          className="font-mono text-sm"
                        />
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <Label>Preview</Label>
                        <div className="max-h-[320px] overflow-auto p-4 border rounded-lg bg-muted/30 prose prose-sm max-w-none">
                          {parseStudyText(studyTextEditorDraft).map((section, i) => (
                            <div key={i} className="mb-4">
                              <h4 className="font-semibold">{section.title}</h4>
                              {section.content.map((p, j) => (
                                <p key={j}>{p}</p>
                              ))}
                              {section.images.map((img, k) => {
                                const resolved = resolvePublicMediaUrl(img, (course as any)?.contentVersion);
                                return (
                                  <div key={k} className="my-3">
                                    <img
                                      src={resolved}
                                      alt={`Study illustration ${k + 1}`}
                                      className="rounded-lg border shadow-sm max-w-full h-auto"
                                    />
                                    <div className="text-xs text-muted-foreground mt-1 break-all">
                                      {img}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Tip: add markers like <code>[IMAGE:Child demonstrating squat form]</code>, then click <b>AI Image</b> to replace the last placeholder marker with a generated URL.
                        </div>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button
                        variant="outline"
                        data-cta-id="cta-studytext-edit-cancel"
                        data-action="close_modal"
                        onClick={() => setStudyTextEditorOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        data-cta-id="cta-studytext-edit-save"
                        data-action="save"
                        onClick={commitStudyTextEditor}
                      >
                        Save (marks unsaved)
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar - Media Library Panel */}
      {showMediaLibrary && (
        <div className="w-80 border-l border-gray-200 bg-gray-50 overflow-hidden">
          <MediaLibraryPanel onSelect={handleMediaLibrarySelect} />
        </div>
      )}

      {/* AI Rewrite Chat Overlay */}
      {showRewriteChat && currentItem && chatTarget && (
        <AIRewriteChatPanel
          open={showRewriteChat}
          onClose={() => setShowRewriteChat(false)}
          course={course}
          item={currentItem}
          target={chatTarget}
          onRewrite={async (target, userPrompt) => {
            const stemText = (currentItem as any).stem?.text || (currentItem as any).text || '';
            const options = ((currentItem as any).options || []).map((o: any) => typeof o === 'string' ? o : (o?.text ?? ''));
            try {
              const current = target.segment === 'stem'
                ? stemText
                : target.segment === 'reference'
                  ? ((currentItem as any).reference?.html || (currentItem as any).referenceHtml || (currentItem as any).explain || '')
                  : (() => {
                      const idx = target.optionIndex ?? 0;
                      return options[idx] || '';
                    })();

const result = await mcp.rewriteText({
                segmentType: target.segment === 'option' ? 'option' : target.segment,
                currentText: current,
                context: {
                  subject: (course as any).subject || course!.title,
                  difficulty: 'intermediate',
                  stem: stemText,
                  options,
                  optionIndex: target.optionIndex,
                  correctIndex: (currentItem as any).correctIndex ?? -1,
                  userPrompt,
                  guidance: target.segment === 'option'
                    ? 'Preserve this option\'s role. Keep it plausible but not the correct answer unless marked correct. Output HTML only.'
                    : 'Output HTML only.',
                  // Rich context from chat
                  course: { id: course!.id, title: course!.title, description: course!.description, gradeBand: (course as any).gradeBand, subject: (course as any).subject },
                  group: { name: (course as any).groups?.[activeGroupIndex]?.name },
                  studyTexts: ((course as any).studyTexts || []).slice(0, 2).map((st: any) => ({ title: st.title, content: st.content, learningObjectives: st.learningObjectives })),
                  adjacentItems: {
                    prev: (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex - 1]?.stem?.text || (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex - 1]?.text || '',
                    next: (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex + 1]?.stem?.text || (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex + 1]?.text || '',
                  },
                  audience: { gradeBand: (course as any).gradeBand },
                  brandVoice: { tone: 'encouraging, clear, concise' },
                },
                candidateCount: 1,
              });
              const proposed = result.candidates?.[0]?.text || '';
              return { original: current, proposed };
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'AI rewrite failed');
              return null;
            }
          }}
        />
      )}

      {/* Comparison Panel Overlay */}
      {showComparePanel && compareData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
            <ComparePanel
              original={compareData.original}
              proposed={compareData.proposed}
              type={compareData.type}
              onAdopt={handleAdoptComparison}
              onReject={handleRejectComparison}
              label={`AI Suggestion — ${compareData.scope === 'studyText' ? 'Study Text' : compareData.scope}${typeof compareData.optionIndex === 'number' ? ` ${String.fromCharCode(65 + compareData.optionIndex)}` : ''}`}
            />
          </div>
        </div>
      )}

      {/* Diff Viewer Overlay (dry-run preview → approve/apply) */}
      {showDiffViewer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <DiffViewer
            diff={diffOps}
            title={auditInfo?.coverage !== undefined ? `Proposed Patch (coverage ${(auditInfo.coverage * 100).toFixed(0)}%)` : 'Proposed Patch (dry-run preview)'}
            onApprove={approveApplyJobResult}
            onCancel={() => { setShowDiffViewer(false); setAuditInfo(null); }}
          />
          {approving && (
            <div className="absolute bottom-6 text-white text-sm">Applying changes…</div>
          )}
        </div>
      )}

          <Button
            variant="outline"
            onClick={async () => {
              if (!courseId) return;
              try {
                await variants.autoFix(courseId);
              } catch (e: any) {
                if (e.message === '403') {
                  toast.info('Enable Option B to apply Auto‑Fix');
                  setShowDiffViewer(false);
                  setDiffOps([]);
                  return;
                }
                toast.error(e instanceof Error ? e.message : 'Auto-Fix failed');
              }
            }}
          >
            ⚡ Auto-Fix
          </Button>
    </div>
  );
};

export default CourseEditor;

