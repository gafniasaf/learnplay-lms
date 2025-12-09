import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Bot, DollarSign, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/types/chat';

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  className?: string;
}

export function ChatPanel({ messages, isLoading, className }: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Check if user is near bottom of scroll
  const isNearBottom = () => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    
    const threshold = 100; // pixels from bottom
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  };

  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    setAutoScroll(isNearBottom());
  };

  // Auto-scroll to bottom when new messages arrive (only if user is already at bottom)
  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    return date.toLocaleDateString();
  };

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(cost < 0.01 ? 4 : 2)}`;
  };

  return (
    <div className={cn('flex flex-col h-full', className)} style={{ background: '#e5ddd5 url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Cg opacity=\'0.05\'%3E%3Cpath fill=\'%23919191\' d=\'M20 30l10-10 10 10-10 10zm30 0l10-10 10 10-10 10z\'/%3E%3Cpath fill=\'%23919191\' d=\'M35 15l10-10 10 10-10 10zm0 30l10-10 10 10-10 10z\'/%3E%3C/g%3E%3C/svg%3E")' }}>
      {/* Messages List */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 sm:px-8 md:px-16 py-4 space-y-2"
        style={{ 
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(0,0,0,0.2) transparent'
        }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-2 opacity-40 px-4">
            <svg className="h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
            </svg>
            <div className="text-gray-800">
              <p className="text-xs sm:text-sm font-medium mb-1">Send a message to get started</p>
              <p className="text-[10px] sm:text-xs max-w-xs mx-auto">
                Your messages are private and protected
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-2 mb-1',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {/* Avatar (AI only) */}
              {message.role === 'assistant' && (
                <Avatar className="h-8 w-8 sm:h-10 sm:w-10 mt-auto mb-1 flex-shrink-0">
                  <AvatarFallback className="bg-gray-300">
                    <Bot className="h-4 w-4 sm:h-5 sm:w-5 text-gray-700" />
                  </AvatarFallback>
                </Avatar>
              )}

              {/* Message Bubble */}
              <div
                className={cn(
                  'relative max-w-[85%] sm:max-w-[75%] md:max-w-[65%] px-3 py-2 shadow-md animate-fade-in',
                  message.role === 'user'
                    ? 'bg-[#d9fdd3] text-gray-900 rounded-tl-lg rounded-tr-lg rounded-bl-lg'
                    : message.role === 'system'
                    ? 'bg-[#fff4ce] text-gray-800 rounded-lg'
                    : 'bg-white text-gray-900 rounded-tl-lg rounded-tr-lg rounded-br-lg'
                )}
              >
                {/* Bubble Tail */}
                {message.role === 'user' && (
                  <div className="absolute -right-1.5 sm:-right-2 bottom-0 w-0 h-0 border-l-[10px] sm:border-l-[12px] border-l-[#d9fdd3] border-b-[10px] sm:border-b-[12px] border-b-transparent" />
                )}
                {message.role === 'assistant' && (
                  <div className="absolute -left-1.5 sm:-left-2 bottom-0 w-0 h-0 border-r-[10px] sm:border-r-[12px] border-r-white border-b-[10px] sm:border-b-[12px] border-b-transparent" />
                )}

                {/* Message Content */}
                <div className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed break-words">
                  {message.content}
                </div>

                {/* Metadata */}
                {message.metadata && (
                  <div className="flex flex-wrap gap-1 sm:gap-1.5 mt-2 pt-2 border-t border-gray-200">
                    {message.metadata.cost !== undefined && (
                      <Badge variant="outline" className="text-[10px] sm:text-xs h-5 sm:h-6 px-1.5 sm:px-2">
                        <DollarSign className="h-2 w-2 sm:h-2.5 sm:w-2.5 mr-0.5" />
                        {formatCost(message.metadata.cost)}
                      </Badge>
                    )}
                    {message.metadata.duration !== undefined && (
                      <Badge variant="outline" className="text-[10px] sm:text-xs h-5 sm:h-6 px-1.5 sm:px-2">
                        <Clock className="h-2 w-2 sm:h-2.5 sm:w-2.5 mr-0.5" />
                        {message.metadata.duration}s
                      </Badge>
                    )}
                    {message.metadata.provider && (
                      <Badge variant="secondary" className="text-[10px] sm:text-xs h-5 sm:h-6 px-1.5 sm:px-2">
                        {message.metadata.provider}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Actions */}
                {message.actions && message.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {message.actions.map((action) => (
                      <Button
                        key={action.id}
                        variant={action.variant || 'outline'}
                        size="sm"
                        onClick={action.onClick}
                        disabled={action.disabled || action.loading}
                        className="text-[10px] sm:text-xs h-8 sm:h-9 px-3 sm:px-4 min-h-[44px] sm:min-h-0"
                      >
                        {action.loading && (
                          <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 animate-spin" />
                        )}
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}

                {/* Status Indicator */}
                {message.status === 'error' && (
                  <div className="flex items-center gap-1 text-xs text-red-600 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    <span>Failed to send</span>
                  </div>
                )}

                {/* Timestamp */}
                <div className={cn(
                  "text-[10px] sm:text-[11px] mt-1 flex items-center gap-1",
                  message.role === 'user' ? 'text-gray-800 justify-end' : 'text-gray-700'
                )}>
                  <span>{formatTimestamp(message.timestamp)}</span>
                  {message.role === 'user' && message.status !== 'error' && (
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z"/>
                    </svg>
                  )}
                </div>
              </div>
            </div>
          ))
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex gap-2 justify-start mb-1">
            <Avatar className="h-8 w-8 sm:h-10 sm:w-10 mt-auto mb-1 flex-shrink-0">
              <AvatarFallback className="bg-gray-300">
                <Bot className="h-4 w-4 sm:h-5 sm:w-5 text-gray-700" />
              </AvatarFallback>
            </Avatar>
            <div className="relative bg-white shadow-md rounded-tl-lg rounded-tr-lg rounded-br-lg px-3 py-2 animate-fade-in">
              <div className="absolute -left-1.5 sm:-left-2 bottom-0 w-0 h-0 border-r-[10px] sm:border-r-[12px] border-r-white border-b-[10px] sm:border-b-[12px] border-b-transparent" />
              <div className="flex items-center gap-2">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Auto-scroll anchor */}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

