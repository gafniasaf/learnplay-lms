import { useState, useCallback } from 'react';
import type { PreviewCourse, PreviewUpdate } from '@/lib/types/chat';
import type { Course } from '@/lib/types/course';

/**
 * Hook to manage in-memory course preview state
 * Nothing is committed to database until explicit publish
 */
export function useCoursePreview() {
  const [preview, setPreview] = useState<PreviewCourse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  /**
   * Initialize a new preview from AI generation
   */
  const initializePreview = useCallback((generatedCourse: Course, metadata: {
    totalCost: number;
    costBreakdown: PreviewCourse['costBreakdown'];
    generationTime: number;
  }) => {
    const previewCourse: PreviewCourse = {
      ...generatedCourse,
      isPreview: true,
      previewId: crypto.randomUUID(),
      generatedAt: new Date().toISOString(),
      status: 'complete',
      publishable: true,
      totalCost: metadata.totalCost,
      costBreakdown: metadata.costBreakdown,
      generationHistory: [{
        timestamp: new Date().toISOString(),
        action: 'initial_generation',
        user_message: 'Generate course',
        ai_response: 'Course generated',
        changes: { created: true },
        cost: metadata.totalCost,
      }],
    };

    setPreview(previewCourse);
    setIsGenerating(false);
    setGenerationError(null);
  }, []);

  /**
   * Load existing course as preview for editing
   */
  const loadExistingAsPreview = useCallback((course: Course) => {
    const previewCourse: PreviewCourse = {
      ...course,
      isPreview: true,
      previewId: crypto.randomUUID(),
      generatedAt: new Date().toISOString(),
      status: 'complete',
      publishable: true,
      totalCost: 0,
      costBreakdown: {
        text_generation: 0,
        images: 0,
        audio: 0,
        video: 0,
      },
      generationHistory: [{
        timestamp: new Date().toISOString(),
        action: 'load_existing',
        user_message: `Load ${course.title}`,
        ai_response: 'Course loaded',
        changes: { loaded: true },
        cost: 0,
      }],
    };

    setPreview(previewCourse);
  }, []);

  /**
   * Apply updates from chat actions
   */
  const applyPreviewUpdates = useCallback((updates: PreviewUpdate[], metadata: {
    user_message: string;
    ai_response: string;
    cost: number;
  }) => {
    if (!preview) return;

    setPreview((prev) => {
      if (!prev) return null;

      let updated = { ...prev };

      // Apply each update
      updates.forEach((update) => {
        switch (update.type) {
          case 'item_modified':
            updated.items = (updated.items ?? []).map(item =>
              item.id === parseInt(update.targetId)
                ? { ...item, ...update.changes }
                : item
            );
            break;

          case 'item_added':
            updated.items = [...updated.items, update.changes];
            break;

          case 'item_deleted':
            updated.items = (updated.items ?? []).filter(item =>
              item.id !== parseInt(update.targetId)
            );
            break;

          case 'study_text_modified':
            updated.studyTexts = updated.studyTexts?.map(text =>
              text.id === update.targetId
                ? { ...text, ...update.changes }
                : text
            );
            break;

          case 'media_generated':
            // Media updates are applied to items/study texts
            break;

          case 'course_metadata':
            updated = { ...updated, ...update.changes };
            break;
        }
      });

      // Update cost
      updated.totalCost += metadata.cost;
      if (metadata.cost > 0) {
        // Categorize cost by type
        updates.forEach((update) => {
          if (update.type === 'media_generated') {
            const mediaType = (update.changes as any).media_type;
            if (mediaType === 'image') {
              updated.costBreakdown.images += metadata.cost;
            } else if (mediaType === 'audio') {
              updated.costBreakdown.audio += metadata.cost;
            } else if (mediaType === 'video') {
              updated.costBreakdown.video += metadata.cost;
            }
          }
        });
      }

      // Add to history
      updated.generationHistory = [
        ...updated.generationHistory,
        {
          timestamp: new Date().toISOString(),
          action: updates.map(u => u.type).join(', '),
          user_message: metadata.user_message,
          ai_response: metadata.ai_response,
          changes: updates.reduce((acc, u) => ({ ...acc, [u.targetId]: u.changes }), {}),
          cost: metadata.cost,
        },
      ];

      return updated;
    });
  }, [preview]);

  /**
   * Clear preview
   */
  const clearPreview = useCallback(() => {
    setPreview(null);
    setIsGenerating(false);
    setGenerationError(null);
  }, []);

  /**
   * Mark preview as generating
   */
  const startGenerating = useCallback(() => {
    setIsGenerating(true);
    setGenerationError(null);
  }, []);

  /**
   * Mark generation as failed
   */
  const setGenerationFailed = useCallback((error: string) => {
    setIsGenerating(false);
    setGenerationError(error);
  }, []);

  /**
   * Get preview statistics
   */
  const getPreviewStats = useCallback(() => {
    if (!preview) return null;

    return {
      exerciseCount: (preview.items?.length ?? 0),
      studyTextCount: preview.studyTexts?.length || 0,
      imageCount: (preview.items ?? []).filter(i => i.stimulus?.type === 'image').length +
                  (preview.studyTexts?.reduce((sum, st) => 
                    sum + (st.content?.match(/\[IMAGE:/g) || []).length, 0) || 0),
      audioCount: (preview.items ?? []).filter(i => i.stimulus?.type === 'audio').length,
      videoCount: (preview.items ?? []).filter(i => i.stimulus?.type === 'video').length,
      totalCost: preview.totalCost,
      costBreakdown: preview.costBreakdown,
      isPublishable: preview.publishable,
    };
  }, [preview]);

  return {
    preview,
    isGenerating,
    generationError,
    initializePreview,
    loadExistingAsPreview,
    applyPreviewUpdates,
    clearPreview,
    startGenerating,
    setGenerationFailed,
    getPreviewStats,
  };
}

