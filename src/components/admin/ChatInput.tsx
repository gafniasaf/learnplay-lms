import { useState, useRef, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuickAction } from '@/lib/types/chat';

interface ChatInputProps {
  onSend: (message: string) => void | Promise<void>;
  disabled?: boolean;
  isLoading?: boolean;
  quickActions?: QuickAction[];
  placeholder?: string;
  maxLength?: number;
}

export function ChatInput({
  onSend,
  disabled = false,
  isLoading = false,
  quickActions = [],
  placeholder = "Type your message or request...",
  maxLength = 2000,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    const message = input.trim();
    if (!message || isLoading || isSending) return;

    setIsSending(true);
    try {
      await onSend(message);
      setInput('');
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    setInput(action.prompt);
    textareaRef.current?.focus();
  };

  // Auto-resize textarea
  const handleInput = (value: string) => {
    setInput(value);
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const charCount = input.length;
  const isNearLimit = charCount > maxLength * 0.8;
  const isOverLimit = charCount > maxLength;

  return (
    <div className="bg-[#f0f2f5] border-t border-gray-200">
      {/* Input Area */}
      <div className="px-4 py-2">
        <div className="flex gap-2 items-end">
          {/* Textarea */}
          <div className="flex-1 relative bg-white rounded-3xl shadow-sm">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled || isLoading || isSending}
              className={cn(
                'min-h-[40px] max-h-[120px] resize-none border-0 px-4 py-2.5 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent rounded-3xl',
                isOverLimit && 'text-destructive'
              )}
              rows={1}
              maxLength={maxLength}
            />
          </div>

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={disabled || isLoading || isSending || isOverLimit || !input.trim()}
            size="icon"
            className="h-10 w-10 rounded-full bg-[#00a884] hover:bg-[#00a884]/90 flex-shrink-0 disabled:opacity-50"
          >
            {isLoading || isSending ? (
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            ) : (
              <Send className="h-5 w-5 text-white" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

