// CourseEditorV2 - Redesigned Course Editor with new UI structure
// This component uses the new component architecture (CommandPalette, FAB, NavigatorV2, etc.)
// while preserving all functionality from the original CourseEditor

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { useAuth } from '@/hooks/useAuth';
import { useMCP } from '@/hooks/useMCP';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { parseStudyText } from '@/lib/types/studyText';
import { resolvePublicMediaUrl } from '@/lib/media/resolvePublicMediaUrl';
import { generateMedia } from '@/lib/api/aiRewrites';
import { CommandPalette } from '@/components/admin/editor/CommandPalette';
import { FloatingActionButton } from '@/components/admin/editor/FloatingActionButton';
import { NavigatorV2 } from '@/components/admin/editor/NavigatorV2';
import { ItemHeaderCard } from '@/components/admin/editor/ItemHeaderCard';
import { PreviewPanelV2 } from '@/components/admin/editor/PreviewPanelV2';
import { StemTab } from '@/components/admin/editor/StemTab';
import { OptionsTab } from '@/components/admin/editor/OptionsTab';
import { ReferenceTab } from '@/components/admin/editor/ReferenceTab';
import { HintsTab } from '@/components/admin/editor/HintsTab';
import { ExercisesTab } from '@/components/admin/editor/ExercisesTab';
import { MediaLibraryPanel } from '@/components/admin/editor/MediaLibraryPanel';
import type { Course, CourseItem } from '@/lib/types/course';
import type { PatchOperation } from '@/lib/api/updateCourse';
import { logger } from '@/lib/logging';
import { useCoursePublishing } from './editor/hooks/useCoursePublishing';
import { useCourseVariants } from './editor/hooks/useCourseVariants';
import { useCourseCoPilot } from './editor/hooks/useCourseCoPilot';
import { isDevAgentMode } from '@/lib/api/common';
import { X, Save, Rocket, RotateCcw, Eye, Edit } from 'lucide-react';

// Import handlers from CourseEditor - we'll copy the essential logic
// For now, this is a structured skeleton that uses the new UI components

const CourseEditorV2 = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const mcp = useMCP();
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
  const [activeTab, setActiveTab] = useState('stem');
  const [topLevelTab, setTopLevelTab] = useState<'exercises' | 'studyTexts'>('exercises');
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  // Destination for Media Library inserts
  const [mediaInsertTarget, setMediaInsertTarget] = useState<{ scope: 'stem' | 'option'; optionIndex?: number }>({ scope: 'stem' });
  // Study Texts editor state
  const [studyTextEditorOpen, setStudyTextEditorOpen] = useState(false);
  const [studyTextEditorIndex, setStudyTextEditorIndex] = useState<number | null>(null);
  const [studyTextEditorTitle, setStudyTextEditorTitle] = useState<string>('');
  const [studyTextEditorDraft, setStudyTextEditorDraft] = useState<string>('');
  const [studyTextEditorLearningObjectives, setStudyTextEditorLearningObjectives] = useState<string>('');
  const [studyTextAiRewriteLoading, setStudyTextAiRewriteLoading] = useState(false);
  const [studyTextAiImageLoading, setStudyTextAiImageLoading] = useState(false);
  const studyTextEditorDraftRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingStudyTextSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor');

  const isAdmin =
    devAgent ||
    role === 'admin' ||
    user?.app_metadata?.role === 'admin' ||
    user?.user_metadata?.role === 'admin';

  const currentItem = course
    ? (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex] || null
    : null;

  const currentItemHasStemImage = (() => {
    if (!course || !currentItem) return false;
    try {
      const itemId = (currentItem as any)?.id;
      const key = typeof itemId === 'number' || typeof itemId === 'string' ? `item:${itemId}:stem` : null;
      const images = key ? (course as any)?.images?.[key] : null;
      if (Array.isArray(images) && images.length > 0) return true;
      if ((currentItem as any)?.stimulus?.type === 'image' && (currentItem as any)?.stimulus?.url) return true;
      const media = (currentItem as any)?.stem?.media || (currentItem as any)?.stimulus?.media || [];
      return Array.isArray(media) && media.some((m: any) => String(m?.type || '').startsWith('image') && !!m?.url);
    } catch {
      return false;
    }
  })();

  // Load course - with course structure transformation
  const loadCourse = useCallback(async () => {
    if (!courseId) return;
    try {
      setLoading(true);
      const courseData = await getCourseRef.current(courseId) as unknown as Course;
      
      // Transform course structure: group items by groupId (same as CourseEditor)
      // Some courses store items in a flat array, need to nest them in groups
      const transformedCourse = { ...courseData };
      const groups = (courseData as any).groups || [];
      const items = (courseData as any).items || [];
      
      // If items exist as flat array, group them by groupId
      if (items.length > 0 && groups.length > 0) {
        const groupedItems = groups.map((group: any) => ({
          ...group,
          items: items.filter((item: any) => item.groupId === group.id)
        }));
        (transformedCourse as any).groups = groupedItems;
        
        logger.debug('[CourseEditorV2] Transformed course structure:', {
          totalItems: items.length,
          groups: groupedItems.map((g: any) => ({ id: g.id, name: g.name, itemCount: g.items.length }))
        });
      }
      
      setCourse(transformedCourse as Course);
      setUnsavedItems(new Set());
    } catch (err) {
      logger.error('[CourseEditorV2] Failed to load course:', err);
      setError(err instanceof Error ? err.message : 'Failed to load course');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (!courseId || !isAdmin) {
      if (!authLoading && !isAdmin) {
        navigate('/admin');
      }
      return;
    }
    void loadCourse();
  }, [courseId, isAdmin, authLoading, navigate, loadCourse]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveDraft();
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleItemChange = (updatedItem: CourseItem) => {
    if (!course) return;
    const updatedCourse = { ...course };
    const groups = (updatedCourse as any).groups || [];
    if (groups[activeGroupIndex]?.items) {
      groups[activeGroupIndex].items[activeItemIndex] = updatedItem;
      (updatedCourse as any).groups = groups;
      setCourse(updatedCourse);
      const itemKey = `${activeGroupIndex}-${activeItemIndex}`;
      setUnsavedItems((prev) => new Set(prev).add(itemKey));
    }
  };

  const handleItemSelect = (groupIndex: number, itemIndex: number) => {
    setActiveGroupIndex(groupIndex);
    setActiveItemIndex(itemIndex);
    setActiveTab('stem');
  };

  const generatePatchOps = (): PatchOperation[] => {
    if (!course || unsavedItems.size === 0) return [];
    const ops: PatchOperation[] = [];
    let hasStudyTextsFullReplace = false;

    // Check if all study texts need replacement
    if (unsavedItems.has('ST-ALL')) {
      hasStudyTextsFullReplace = true;
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

      logger.debug('[CourseEditorV2] Saving draft with ops:', ops);

      await mcp.updateCourse(courseId, ops);

      setUnsavedItems(new Set());
      toast.success(`Draft saved (${ops.length} changes)`);
    } catch (err) {
      logger.error('[CourseEditorV2] Save failed:', err);
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
    if (!changelog) return;
    try {
      setSaving(true);
      await publishing.publishWithPreflight(courseId, changelog, 0.9);
      toast.success('Course published');
      navigate('/admin/courses/select');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (unsavedItems.size === 0) return;
    if (confirm(`Discard ${unsavedItems.size} unsaved change(s)?`)) {
      loadCourse();
    }
  };

  const handleClose = () => {
    if (unsavedItems.size > 0) {
      if (confirm(`You have ${unsavedItems.size} unsaved changes. Discard and close?`)) {
        navigate('/admin/courses/select');
      }
    } else {
      navigate('/admin/courses/select');
    }
  };

  const handleAddGroup = () => {
    if (!course) return;
    const groups = ((course as any).groups || []).map((g: any) => ({ ...g, items: [...(g.items||[])] }));
    const nextId = groups.reduce((m: number, g: any) => Math.max(m, Number(g.id || 0)), 0) + 1;
    groups.push({ id: nextId, name: `Group ${groups.length + 1}`, items: [] });
    setCourse({ ...(course as any), groups } as Course);
    toast.success('Group added');
  };

  const handleAIRewriteStem = async () => {
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
        // Apply the rewrite directly (simplified - full version would use ComparePanel)
        handleItemChange({ ...currentItem, stem: { ...(currentItem as any).stem, text: newText } } as CourseItem);
        toast.success('AI rewrite applied');
      }
    } catch (error) {
      logger.error('AI rewrite failed:', error);
      toast.error(error instanceof Error ? error.message : 'AI rewrite failed');
    }
  };

  const handleAIRewriteOption = async (index: number) => {
    if (!currentItem || !course) return;
    const options = (currentItem as any).options || [];
    if (!options[index]) {
      toast.error('Option not found');
      return;
    }
    const optionText = typeof options[index] === 'string' ? options[index] : options[index].text || '';
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
          guidance: 'Preserve the role of this option. If distractor, keep it plausible but not the correct answer. Output HTML only.',
          course: { id: course.id, title: course.title, description: course.description, gradeBand: (course as any).gradeBand, subject: (course as any).subject },
          group: { name: (course as any).groups?.[activeGroupIndex]?.name },
        },
        candidateCount: 1,
      });
      if (result.candidates && result.candidates.length > 0) {
        const newText = result.candidates[0].text;
        const updatedOptions = [...options];
        updatedOptions[index] = typeof options[index] === 'string' ? newText : { ...options[index], text: newText };
        handleItemChange({ ...currentItem, options: updatedOptions } as CourseItem);
        toast.success('AI rewrite applied');
      }
    } catch (error) {
      logger.error('AI rewrite failed:', error);
      toast.error(error instanceof Error ? error.message : 'AI rewrite failed');
    }
  };

  // Media handlers
  const handleAddMediaToStem = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,audio/*,video/*';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        toast.info('Uploading media...');
        const path = `temp/${Date.now()}-${file.name}`;
        const result = await mcp.uploadMediaFile(file, path);

        if (!result.ok) throw new Error('Upload failed');

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
        logger.error('[CourseEditorV2] Upload failed:', error);
        toast.error(error instanceof Error ? error.message : 'Upload failed');
      }
    };

    input.click();
  };

  const handleAddMediaFromURL = (url: string, type: 'image' | 'audio' | 'video') => {
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

  const handleRemoveMedia = (mediaId: string) => {
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
        logger.error('[CourseEditorV2] Replace failed:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to replace media');
      }
    };

    input.click();
  };

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

        if (!currentItem) return;

        const newMedia = {
          type: file.type.startsWith('image/') ? 'image' :
                file.type.startsWith('audio/') ? 'audio' : 'video',
          url: uploadResult.url,
          alt: file.name,
        };

        const existingOptionMedia = (currentItem as any).optionMedia || [];
        const updatedOptionMedia = [...existingOptionMedia];
        updatedOptionMedia[index] = newMedia;

        const updatedItem = { ...currentItem, optionMedia: updatedOptionMedia };
        handleItemChange(updatedItem);
        toast.success(`Media uploaded for option ${index + 1}`);
      } catch (error) {
        logger.error('[CourseEditorV2] Upload failed:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to upload media');
      }
    };

    input.click();
  };

  const handleRemoveOptionMedia = (index: number) => {
    if (!currentItem) return;
    const optionMedia = [...((currentItem as any).optionMedia || [])];
    optionMedia[index] = null;
    const updated = { ...currentItem, optionMedia };
    handleItemChange(updated);
    toast.success('Option media removed');
  };

  const handleModeChange = (mode: 'options' | 'numeric') => {
    if (!currentItem) return;
    const updated = { ...currentItem, mode };
    handleItemChange(updated);
  };

  const handleAIGenerateHints = async () => {
    if (!courseId) {
      toast.error('Missing courseId');
      return;
    }
    if (!currentItem) {
      toast.error('No item selected');
      return;
    }
    if (unsavedItems.size > 0) {
      toast.error('Please save or discard unsaved changes before generating hints');
      return;
    }

    try {
      toast.info('Generating hints…');
      await mcp.call('lms.enrichHints', { courseId, itemIds: [Number((currentItem as any).id)] });
      toast.success('Hints generated and saved');
      await loadCourse();
    } catch (e) {
      logger.error('[CourseEditorV2] enrich-hints failed:', e);
      toast.error(e instanceof Error ? e.message : 'Hint generation failed');
    }
  };

  // Course-level handlers
  const handleRepairCourse = async () => {
    if (!courseId) return;
    try {
      toast.info('Repairing course...');
      const diff = await variants.repairPreview(courseId);
      if (!Array.isArray(diff) || diff.length === 0) {
        toast.info('Repair found nothing to change');
        return;
      }
      toast.success(`Repair found ${diff.length} changes - review and apply`);
      // TODO: Wire diff viewer
    } catch (e) {
      logger.error('[CourseEditorV2] Repair failed:', e);
      toast.error(e instanceof Error ? e.message : 'Repair failed');
    }
  };

  const handleAuditVariants = async () => {
    if (!courseId) return;
    try {
      toast.info('Auditing variants...');
      const result = await variants.variantsAudit(courseId);
      toast.success('Audit complete - check coverage');
      // TODO: Wire audit info display
    } catch (e) {
      logger.error('[CourseEditorV2] Audit failed:', e);
      toast.error(e instanceof Error ? e.message : 'Variants audit failed');
    }
  };

  const handleGenerateMissingVariants = async () => {
    if (!courseId) return;
    try {
      toast.info('Generating missing variants...');
      const diff = await variants.variantsMissing(courseId);
      if (!Array.isArray(diff) || diff.length === 0) {
        toast.info('No missing variants to generate');
        return;
      }
      toast.success(`Generated ${diff.length} missing variants`);
      // TODO: Wire diff viewer
    } catch (e) {
      logger.error('[CourseEditorV2] Generate variants failed:', e);
      toast.error(e instanceof Error ? e.message : 'Generate missing variants failed');
    }
  };

  const handleCoPilotVariants = async () => {
    if (!courseId) return;
    try {
      toast.info('Starting Co-Pilot: Variants...');
      const subject = (course as any)?.subject || course?.title || courseId || 'Untitled';
      const jobId = await copilot.startVariants(courseId, subject);
      toast.success(`Co-Pilot started (variants). Job: ${jobId}`);
      // TODO: Wire job progress tracking
    } catch (e) {
      logger.error('[CourseEditorV2] Co-Pilot variants failed:', e);
      toast.error(e instanceof Error ? e.message : 'Co-Pilot failed');
    }
  };

  const handleCoPilotEnrich = async () => {
    if (!courseId) return;
    try {
      toast.info('Starting Co-Pilot: Enrich...');
      const subject = (course as any)?.subject || course?.title || courseId || 'Untitled';
      const jobId = await copilot.startEnrich(courseId, subject);
      toast.success(`Co-Pilot started (enrich). Job: ${jobId}`);
      // TODO: Wire job progress tracking
    } catch (e) {
      logger.error('[CourseEditorV2] Co-Pilot enrich failed:', e);
      toast.error(e instanceof Error ? e.message : 'Co-Pilot failed');
    }
  };

  const handleLocalizeCourse = async () => {
    if (!courseId) return;
    const locale = prompt('Target locale (e.g., es-419, fr-FR)?') || 'es-419';
    if (!locale) return;
    try {
      toast.info(`Localizing to ${locale}...`);
      const subject = (course as any)?.subject || course?.title || courseId || 'Untitled';
      const jobId = await copilot.startLocalize(courseId, subject, locale);
      toast.success(`Co-Pilot started (localize ${locale}). Job: ${jobId}`);
      // TODO: Wire job progress tracking
    } catch (e) {
      logger.error('[CourseEditorV2] Localize failed:', e);
      toast.error(e instanceof Error ? e.message : 'Localization failed');
    }
  };

  const handleArchiveCourse = async () => {
    if (!courseId) return;
    const reason = prompt('Reason for archiving (optional):') || undefined;
    try {
      await publishing.archiveCourse(courseId, reason);
      toast.success('Course archived');
      navigate('/admin/courses/select');
    } catch (e) {
      logger.error('[CourseEditorV2] Archive failed:', e);
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
      logger.error('[CourseEditorV2] Delete failed:', e);
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleAIRewriteReference = async () => {
    if (!currentItem || !course) return;
    const referenceText = (currentItem as any).reference?.html || (currentItem as any).referenceHtml || (currentItem as any).explain || '';
    if (!referenceText) {
      toast.error('No explanation text to rewrite');
      return;
    }
    try {
      toast.info('Generating AI rewrite...');
      const result = await mcp.rewriteText({
        segmentType: 'reference',
        currentText: referenceText,
        context: {
          subject: (course as any).subject || course.title,
          difficulty: 'intermediate',
          stem: (currentItem as any).stem?.text || (currentItem as any).text || '',
          options: ((currentItem as any).options || []).map((o: any) => typeof o === 'string' ? o : (o?.text ?? '')),
          correctIndex: (currentItem as any).correctIndex ?? -1,
          guidance: 'Write a clear explanation of why the correct answer is correct. Output HTML only.',
          course: { id: course.id, title: course.title, description: course.description, gradeBand: (course as any).gradeBand, subject: (course as any).subject },
        },
        candidateCount: 1,
      });
      if (result.candidates && result.candidates.length > 0) {
        const newText = result.candidates[0].text;
        handleItemChange({ ...currentItem, reference: { html: newText } } as CourseItem);
        toast.success('AI rewrite applied');
      }
    } catch (error) {
      logger.error('AI rewrite failed:', error);
      toast.error(error instanceof Error ? error.message : 'AI rewrite failed');
    }
  };

  // Command palette commands
  const commands = [
    {
      id: 'save',
      title: 'Save Draft',
      description: 'Save current changes',
      icon: '💾',
      shortcut: ['Ctrl', 'S'],
      action: handleSaveDraft,
      group: 'File',
    },
    {
      id: 'publish',
      title: 'Publish Course',
      description: 'Publish as new version',
      icon: '🚀',
      shortcut: ['Ctrl', 'P'],
      action: handlePublish,
      group: 'File',
    },
    {
      id: 'discard',
      title: 'Discard Changes',
      description: 'Revert to last saved state',
      icon: '↩️',
      action: handleDiscard,
      group: 'File',
    },
    {
      id: 'repair',
      title: 'Repair Course',
      description: 'Auto-fix common issues',
      icon: '🛠️',
      action: handleRepairCourse,
      group: 'AI',
    },
    {
      id: 'audit',
      title: 'Audit Variants',
      description: 'Check variant coverage',
      icon: '🔍',
      action: handleAuditVariants,
      group: 'AI',
    },
    {
      id: 'generate-variants',
      title: 'Generate Missing Variants',
      description: 'Create missing difficulty variants',
      icon: '➕',
      action: handleGenerateMissingVariants,
      group: 'AI',
    },
    {
      id: 'copilot-variants',
      title: 'Co-Pilot: Variants',
      description: 'AI-powered variant generation',
      icon: '✨',
      action: handleCoPilotVariants,
      group: 'AI',
    },
    {
      id: 'copilot-enrich',
      title: 'Co-Pilot: Enrich',
      description: 'AI-powered content enrichment',
      icon: '✨',
      action: handleCoPilotEnrich,
      group: 'AI',
    },
    {
      id: 'localize',
      title: 'Localize Course',
      description: 'Translate to another language',
      icon: '🌐',
      action: handleLocalizeCourse,
      group: 'AI',
    },
    {
      id: 'fix-missing-images',
      title: 'Fix Missing Stem Images',
      description: 'Generate AI images for items without stem images',
      icon: '🖼️',
      action: async () => {
        if (!courseId) return;
        try {
          toast.info('Enqueueing jobs for missing stem images...');
          await mcp.call<any>('lms.enqueueCourseMissingImages', { courseId, limit: 25 });
          toast.success('Batch image generation jobs enqueued');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Failed to enqueue jobs');
        }
      },
      group: 'AI',
    },
    {
      id: 'archive',
      title: 'Archive Course',
      description: 'Archive this course',
      icon: '📦',
      action: handleArchiveCourse,
      group: 'Course',
    },
    {
      id: 'delete',
      title: 'Delete Course',
      description: 'Permanently delete this course',
      icon: '🗑️',
      action: handleDeleteCourse,
      group: 'Course',
    },
  ];

  // Study Texts handlers
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
    const el = studyTextEditorDraftRef.current;
    const hasSelStart = typeof el?.selectionStart === 'number';
    const hasSelEnd = typeof el?.selectionEnd === 'number';
    const selectionStart = hasSelStart ? (el!.selectionStart as number) : null;
    const selectionEnd = hasSelEnd ? (el!.selectionEnd as number) : null;

    setStudyTextEditorDraft((prev) => {
      const base = String(prev ?? '');
      const start = selectionStart ?? base.length;
      const end = selectionEnd ?? base.length;
      const before = base.slice(0, start);
      const after = base.slice(end);

      // Put markers on their own line by default.
      const leading = before.length === 0 || before.endsWith('\n') ? '' : '\n';
      const trailing = after.startsWith('\n') || after.length === 0 ? '\n' : '\n';

      const next = `${before}${leading}${marker}${trailing}${after}`;

      // Highlight placeholder text (between ':' and ']') so it feels responsive.
      const markerStart = before.length + leading.length;
      const placeholderStartOffset = Math.max(marker.indexOf(':') + 1, 0);
      const placeholderEndOffset = Math.max(marker.length - 1, placeholderStartOffset);
      pendingStudyTextSelectionRef.current = {
        start: markerStart + placeholderStartOffset,
        end: markerStart + placeholderEndOffset,
      };

      return next;
    });
  };

  // After inserting markers, highlight the placeholder text so the user can immediately type over it.
  useEffect(() => {
    if (!studyTextEditorOpen) return;
    const pending = pendingStudyTextSelectionRef.current;
    const el = studyTextEditorDraftRef.current;
    if (!pending || !el) return;

    pendingStudyTextSelectionRef.current = null;
    try {
      el.focus();
      el.setSelectionRange(pending.start, pending.end);
    } catch {
      // best-effort; do not crash editor if selection fails in an embedded environment
    }
  }, [studyTextEditorDraft, studyTextEditorOpen]);

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
          brandVoice: { tone: 'encouraging, clear, concise' },
        },
        candidateCount: 1,
      });

      if (result.candidates && result.candidates.length > 0) {
        setStudyTextEditorDraft(result.candidates[0].text);
        toast.success('AI rewrite complete (remember to Save)');
      } else {
        toast.error('No rewrite candidates returned');
      }
    } catch (err) {
      logger.error('[CourseEditorV2] StudyText AI rewrite failed:', err);
      toast.error(err instanceof Error ? err.message : 'AI rewrite failed');
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
      logger.error('[CourseEditorV2] StudyText image generation failed:', e);
      toast.error(e instanceof Error ? e.message : 'AI image generation failed');
    } finally {
      setStudyTextAiImageLoading(false);
    }
  };

  // FAB actions
  const fabActions = [
    {
      id: 'ai-rewrite-stem',
      label: 'AI Rewrite Stem',
      icon: '✨',
      onClick: handleAIRewriteStem,
    },
    {
      id: 'add-image-ai',
      label: 'Add Stem Image (AI)',
      icon: '🖼️',
      onClick: async () => {
        if (!courseId || !currentItem) return;
        try {
          toast.info('Generating stem image...');
          const stemText = (currentItem as any).stem?.text || (currentItem as any).text || '';
          const prompt = stemText ? `Generate an illustrative image: ${stemText}` : `Generate an illustrative image for item ${currentItem.id}`;
          await mcp.call<any>('lms.enqueueCourseMedia', {
            courseId,
            itemId: currentItem.id,
            prompt,
            style: 'clean-diagram',
          });
          toast.success('Image generation job enqueued');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Failed to generate image');
        }
      },
    },
    {
      id: 'generate-exercises',
      label: 'Generate Exercises',
      icon: '📝',
      onClick: async () => {
        if (!courseId) return;
        try {
          toast.info('Generating exercises...');
          await mcp.enqueueJob('ai_course_generate', { targetId: courseId });
          toast.success('Exercise generation job enqueued');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Failed to generate exercises');
        }
      },
    },
  ];

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading course...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={() => navigate('/admin')}>Go Back</Button>
        </div>
      </div>
    );
  }

  if (!course) {
    return null;
  }

  const unsavedCount = unsavedItems.size;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 bg-white border-b border-gray-200 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-orange-500 rounded-md flex items-center justify-center text-white font-bold text-sm">
            LP
          </div>
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <span>Course Editor</span>
            <span className="text-gray-400">›</span>
            <span className="font-semibold text-gray-900 max-w-[200px] truncate">
              {course.title || courseId}
            </span>
          </nav>
          {unsavedCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold">
              <span className="w-1.5 h-1.5 bg-yellow-600 rounded-full animate-pulse" />
              {unsavedCount} unsaved
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCommandPaletteOpen(true)}
            data-cta-id="cta-courseeditor-command-palette"
            data-action="modal"
            title="Command Palette (Ctrl+K)"
          >
            ⌘
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 mr-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('editor')}
              // NOTE: Don't use Button "default" variant here because it sets `text-primary-foreground`
              // (often white). Since we style the active pill with `bg-white`, default can yield white-on-white
              // text in some themes. Use explicit text colors for reliable contrast.
              className={viewMode === 'editor'
                ? 'bg-white shadow-sm text-gray-900 hover:bg-white'
                : 'text-gray-700 hover:text-gray-900'
              }
              data-cta-id="cta-courseeditor-view-editor"
            >
              <Edit className="h-4 w-4 mr-1" />
              Editor
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('preview')}
              className={viewMode === 'preview'
                ? 'bg-white shadow-sm text-gray-900 hover:bg-white'
                : 'text-gray-700 hover:text-gray-900'
              }
              data-cta-id="cta-courseeditor-view-preview"
            >
              <Eye className="h-4 w-4 mr-1" />
              Preview
            </Button>
          </div>
          <Button variant="ghost" onClick={handleClose} data-cta-id="cta-courseeditor-close" data-action="navigate">
            <X className="h-4 w-4 mr-1" />
            Close
          </Button>
          <Button variant="secondary" onClick={handleDiscard} data-cta-id="cta-courseeditor-discard" data-action="action">
            <RotateCcw className="h-4 w-4 mr-1" />
            Discard
          </Button>
          <Button
            variant="secondary"
            onClick={handleSaveDraft}
            disabled={saving || unsavedCount === 0}
            data-cta-id="cta-courseeditor-save"
            data-action="action"
          >
            <Save className="h-4 w-4 mr-1" />
            Save Draft
            <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-gray-100 border border-gray-200 rounded">Ctrl+S</kbd>
          </Button>
          <Button
            variant="default"
            onClick={handlePublish}
            disabled={saving || unsavedCount > 0}
            data-cta-id="cta-courseeditor-publish"
            data-action="action"
          >
            <Rocket className="h-4 w-4 mr-1" />
            Publish
          </Button>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="flex gap-1 px-4 bg-white border-b border-gray-200">
        <button
          className={`px-4 py-3 border-b-2 font-medium text-sm transition-colors ${
            topLevelTab === 'exercises'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
          onClick={() => setTopLevelTab('exercises')}
          data-cta-id="cta-courseeditor-tab-exercises"
          data-action="tab"
        >
          📝 Exercises
        </button>
        <button
          className={`px-4 py-3 border-b-2 font-medium text-sm transition-colors ${
            topLevelTab === 'studyTexts'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
          onClick={() => setTopLevelTab('studyTexts')}
          data-cta-id="cta-courseeditor-tab-studytexts"
          data-action="tab"
        >
          📚 Study Texts
        </button>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {topLevelTab === 'exercises' && (
          <>
            {/* Navigator Sidebar - Always visible */}
            <NavigatorV2
              course={course}
              activeGroupIndex={activeGroupIndex}
              activeItemIndex={activeItemIndex}
              onItemSelect={handleItemSelect}
              unsavedItems={unsavedItems}
              onAddGroup={handleAddGroup}
              onCollapseAll={() => {
                // NavigatorV2 handles collapse internally
              }}
            />

            {viewMode === 'editor' ? (
              <>
                {/* Editor Area - Editor Mode Only */}
                <main className="flex-1 flex flex-col overflow-hidden bg-gray-50">
              <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-[900px] mx-auto">
                  {currentItem ? (
                    <>
                      {/* Item Header Card */}
                      <ItemHeaderCard
                        item={currentItem}
                        groupIndex={activeGroupIndex}
                        itemIndex={activeItemIndex}
                        course={course}
                        mode={(currentItem as any).mode || 'options'}
                        onModeChange={handleModeChange}
                        hasMissingImage={!currentItemHasStemImage}
                      />

                      {/* Editor Card */}
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                          <div className="flex border-b border-gray-200 bg-gray-50">
                            <TabsList className="bg-transparent border-0">
                              <TabsTrigger
                                value="stem"
                                data-cta-id="cta-courseeditor-editor-tab-stem"
                                data-action="tab"
                              >
                                Stem
                              </TabsTrigger>
                              <TabsTrigger
                                value="options"
                                data-cta-id="cta-courseeditor-editor-tab-options"
                                data-action="tab"
                              >
                                {(currentItem as any)?.mode === 'numeric' ? 'Answer' : 'Options'}
                              </TabsTrigger>
                              <TabsTrigger
                                value="explanation"
                                data-cta-id="cta-courseeditor-editor-tab-explanation"
                                data-action="tab"
                              >
                                Explanation
                              </TabsTrigger>
                              <TabsTrigger
                                value="hints"
                                data-cta-id="cta-courseeditor-editor-tab-hints"
                                data-action="tab"
                              >
                                Hints
                              </TabsTrigger>
                              <TabsTrigger
                                value="exercises"
                                data-cta-id="cta-courseeditor-editor-tab-exercises"
                                data-action="tab"
                              >
                                New Exercises
                              </TabsTrigger>
                            </TabsList>
                          </div>

                          <div className="p-5">
                            <TabsContent value="stem" className="mt-0">
                              <StemTab
                                item={currentItem}
                                onChange={handleItemChange}
                                onAIRewrite={handleAIRewriteStem}
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
                                onAddMedia={handleAddMediaToOption}
                                onRemoveOptionMedia={handleRemoveOptionMedia}
                                courseId={courseId || ''}
                                course={course}
                              />
                            </TabsContent>
                            <TabsContent value="explanation" className="mt-0">
                              <ReferenceTab
                                item={currentItem}
                                onChange={handleItemChange}
                                onAIRewrite={handleAIRewriteReference}
                              />
                            </TabsContent>
                            <TabsContent value="hints" className="mt-0">
                              <HintsTab
                                item={currentItem as any}
                                onChange={handleItemChange as any}
                                onAIGenerate={handleAIGenerateHints}
                                aiDisabled={unsavedItems.size > 0}
                              />
                            </TabsContent>
                            <TabsContent value="exercises" className="mt-0">
                              <ExercisesTab
                                courseId={courseId || ''}
                                onAdopt={(exercises) => {
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
                                    logger.error('[CourseEditorV2] Failed to adopt exercises:', error);
                                    toast.error('Failed to adopt exercises');
                                  }
                                }}
                              />
                            </TabsContent>
                          </div>
                        </Tabs>
                      </div>
                    </>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-400">
                      <p>Select an item to edit</p>
                    </div>
                  )}
                </div>
              </div>
                </main>
              </>
            ) : (
              /* Preview Mode - WYSIWYG Preview Only */
              <PreviewPanelV2
                item={currentItem}
                contentVersion={(course as any)?.contentVersion}
                courseId={courseId}
                courseTitle={course?.title}
                fullScreen={true}
                onRefresh={() => {
                  toast.info('Preview refreshed');
                }}
                onOptionSelect={(index) => {
                  toast.info(`Option ${index} selected`);
                }}
              />
            )}

            {/* Media Library Sidebar */}
            {showMediaLibrary && (
              <div className="w-80 border-l border-gray-200 bg-white flex flex-col">
                <MediaLibraryPanel
                  onSelect={(assets) => {
                    if (!currentItem || assets.length === 0) {
                      setShowMediaLibrary(false);
                      return;
                    }

                    const newMediaItems = assets.map(asset => ({
                      id: asset.id,
                      type: asset.mimeType?.startsWith('image/') ? 'image' :
                            asset.mimeType?.startsWith('audio/') ? 'audio' : 'video',
                      url: asset.url,
                      alt: asset.alt || 'Media asset',
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
                  }}
                />
              </div>
            )}
          </>
        )}

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
                    setUnsavedItems((prev) => new Set(prev).add('ST-ALL'));
                    openStudyTextEditor(nextIndex);
                  }}
                >
                  + Add Study Text
                </Button>

                <Dialog open={studyTextEditorOpen} onOpenChange={setStudyTextEditorOpen}>
                  <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col p-4 sm:p-6">
                    <DialogHeader>
                      <DialogTitle>Edit Study Text</DialogTitle>
                      <DialogDescription>
                        Edit the raw content. Markers like <code>[SECTION:Title]</code> are supported.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
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
                          ref={studyTextEditorDraftRef}
                          value={studyTextEditorDraft}
                          onChange={(e) => setStudyTextEditorDraft(e.target.value)}
                          rows={14}
                          className="font-mono text-sm"
                        />
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <Label>Preview</Label>
                        <div className="max-h-[240px] sm:max-h-[320px] overflow-auto p-4 border rounded-lg bg-muted/30 prose prose-sm max-w-none">
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
                                    <img src={resolved} alt={img} className="max-w-full rounded" />
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button variant="outline" onClick={() => setStudyTextEditorOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={commitStudyTextEditor}>
                        Save Changes
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commands}
      />

      {/* Floating Action Button */}
      <FloatingActionButton actions={fabActions} />
    </div>
  );
};

export default CourseEditorV2;

