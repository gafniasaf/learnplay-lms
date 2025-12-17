// CourseEditorV2 - Redesigned Course Editor with new UI structure
// This component uses the new component architecture (CommandPalette, FAB, NavigatorV2, etc.)
// while preserving all functionality from the original CourseEditor

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useMCP } from '@/hooks/useMCP';
import { toast } from 'sonner';
import { CommandPalette } from '@/components/admin/editor/CommandPalette';
import { FloatingActionButton } from '@/components/admin/editor/FloatingActionButton';
import { NavigatorV2 } from '@/components/admin/editor/NavigatorV2';
import { ItemHeaderCard } from '@/components/admin/editor/ItemHeaderCard';
import { PreviewPanelV2 } from '@/components/admin/editor/PreviewPanelV2';
import { StemTab } from '@/components/admin/editor/StemTab';
import { OptionsTab } from '@/components/admin/editor/OptionsTab';
import { ReferenceTab } from '@/components/admin/editor/ReferenceTab';
import { ExercisesTab } from '@/components/admin/editor/ExercisesTab';
import { MediaLibraryPanel } from '@/components/admin/editor/MediaLibraryPanel';
import type { Course, CourseItem } from '@/lib/types/course';
import type { PatchOperation } from '@/lib/api/updateCourse';
import { logger } from '@/lib/logging';
import { useCoursePublishing } from './editor/hooks/useCoursePublishing';
import { useCourseVariants } from './editor/hooks/useCourseVariants';
import { useCourseCoPilot } from './editor/hooks/useCourseCoPilot';
import { isDevAgentMode } from '@/lib/api/common';
import { X, Save, Rocket, RotateCcw } from 'lucide-react';

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

  const isAdmin =
    devAgent ||
    role === 'admin' ||
    user?.app_metadata?.role === 'admin' ||
    user?.user_metadata?.role === 'admin';

  const currentItem = course
    ? (course as any).groups?.[activeGroupIndex]?.items?.[activeItemIndex] || null
    : null;

  // Load course - simplified version
  const loadCourse = useCallback(async () => {
    if (!courseId) return;
    try {
      setLoading(true);
      const courseData = await getCourseRef.current(courseId) as unknown as Course;
      setCourse(courseData);
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
    // Add more commands as needed
  ];

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
      label: 'Add Image (AI)',
      icon: '🖼️',
      onClick: async () => {
        if (!courseId || !currentItem) return;
        try {
          toast.info('Generating image...');
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
            {/* Navigator Sidebar */}
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

            {/* Editor Area */}
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
                        onModeChange={(mode) => {
                          handleItemChange({ ...currentItem, mode } as CourseItem);
                        }}
                        onAddImageAI={async () => {
                          if (!courseId || !currentItem) return;
                          try {
                            toast.info('Generating image...');
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
                        }}
                        onFixMissingImages={async () => {
                          if (!courseId) return;
                          try {
                            toast.info('Enqueueing jobs for missing images...');
                            await mcp.call<any>('lms.enqueueCourseMissingImages', { courseId, limit: 25 });
                            toast.success('Batch image generation jobs enqueued');
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : 'Failed to enqueue jobs');
                          }
                        }}
                        hasMissingImage={false}
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
                                Options
                              </TabsTrigger>
                              <TabsTrigger
                                value="explanation"
                                data-cta-id="cta-courseeditor-editor-tab-explanation"
                                data-action="tab"
                              >
                                Explanation
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
                                onAddMedia={() => {
                                  setMediaInsertTarget({ scope: 'stem' });
                                  setShowMediaLibrary(true);
                                }}
                                courseId={courseId || ''}
                                course={course}
                              />
                            </TabsContent>
                            <TabsContent value="options" className="mt-0">
                              <OptionsTab
                                item={currentItem}
                                onChange={handleItemChange}
                                onAIRewrite={handleAIRewriteOption}
                                onAddMedia={(index) => {
                                  setMediaInsertTarget({ scope: 'option', optionIndex: index });
                                  setShowMediaLibrary(true);
                                }}
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

            {/* Preview Panel */}
            <PreviewPanelV2
              item={currentItem}
              onRefresh={() => {
                toast.info('Preview refreshed');
              }}
              onOptionSelect={(index) => {
                toast.info(`Option ${index} selected`);
              }}
            />

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
                <p className="text-gray-500 mb-6">
                  Course-level reference content and learning materials.
                </p>
                <p className="text-sm text-gray-400">
                  Study Texts editor functionality to be wired from CourseEditor
                </p>
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

