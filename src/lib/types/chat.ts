/**
 * Chat Types for Conversational Course Studio
 */

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'sending' | 'sent' | 'error';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  status?: MessageStatus;
  
  // Optional metadata
  metadata?: {
    cost?: number;
    duration?: number;
    provider?: string;
    function_call?: string;
  };
  
  // Optional actions/buttons
  actions?: ChatAction[];
  
  // Optional preview updates
  previewUpdates?: PreviewUpdate[];
}

export interface ChatAction {
  id: string;
  label: string;
  variant?: 'default' | 'outline' | 'destructive' | 'secondary';
  icon?: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
}

export interface PreviewUpdate {
  type: 'item_modified' | 'item_added' | 'item_deleted' | 'study_text_modified' | 'media_generated' | 'course_metadata';
  targetId: string;
  description: string;
  changes: Record<string, unknown>;
}

export interface ChatContext {
  courseId?: string;
  previewCourse: PreviewCourse | null;
  conversationHistory: ChatMessage[];
  totalCost: number;
}

export interface PreviewCourse {
  // Extends CourseV2 but with preview-specific fields
  id: string;
  title: string;
  description?: string;
  studyTexts?: any[];
  items: any[];
  levels: any[];
  groups: any[];
  
  // Preview metadata
  isPreview: true;
  previewId: string;
  generatedAt: string;
  status: 'generating' | 'complete' | 'error';
  publishable: boolean;
  
  // Cost tracking
  totalCost: number;
  costBreakdown: {
    text_generation: number;
    images: number;
    audio: number;
    video: number;
  };
  
  // Generation history
  generationHistory: Array<{
    timestamp: string;
    action: string;
    user_message: string;
    ai_response: string;
    changes: object;
    cost: number;
  }>;
}

export interface ChatFunctionCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatFunctionResult {
  success: boolean;
  message: string;
  previewUpdates?: PreviewUpdate[];
  cost?: number;
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
}

// Quick action templates
export interface QuickAction {
  id: string;
  label: string;
  prompt: string;
  icon?: string;
  category?: 'creation' | 'modification' | 'multimedia' | 'review';
}

export const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'create-basic',
    label: 'Create Basic Course',
    prompt: 'Create a course with 12 exercises, no multimedia',
    icon: '📝',
    category: 'creation',
  },
  {
    id: 'create-rich',
    label: 'Create Rich Course',
    prompt: 'Create a course with study texts, images, and videos',
    icon: '🎨',
    category: 'creation',
  },
  {
    id: 'make-easier',
    label: 'Make Easier',
    prompt: 'Make this course easier for students',
    icon: '⬇️',
    category: 'modification',
  },
  {
    id: 'add-images',
    label: 'Add More Images',
    prompt: 'Add images to exercises that need them',
    icon: '🖼️',
    category: 'multimedia',
  },
  {
    id: 'add-hints',
    label: 'Add Hints',
    prompt: 'Add helpful hints to all exercises',
    icon: '💡',
    category: 'modification',
  },
  {
    id: 'review-quality',
    label: 'Review Quality',
    prompt: 'Review this course and suggest improvements',
    icon: '🔍',
    category: 'review',
  },
];

