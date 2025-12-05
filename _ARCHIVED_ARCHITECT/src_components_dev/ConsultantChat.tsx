import { useState, useEffect, useRef, Fragment, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Send, RefreshCw, Bot, User, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type ConsultantMode = 'plan' | 'mockup';

interface ConsultantChatProps {
  context: any;
  mode?: ConsultantMode;
  ownerId?: string;
  sessionId?: string;
  sourcePrompt?: string;
  mockups?: {
    id: string;
    title: string;
    url?: string | null;
    html?: string;
    source?: string;
  }[];
  onUpdatePlan?: (newPrompt: string) => void;
  onMockupBrief?: (brief: string) => void;
  onClose: () => void;
}

export function ConsultantChat({
  context,
  mode = 'plan',
  ownerId,
  sessionId,
  sourcePrompt,
  mockups = [],
  onUpdatePlan,
  onMockupBrief,
  onClose,
}: ConsultantChatProps) {
  const initialMessage =
    mode === 'mockup'
      ? 'Let’s dial in the visual direction. Tell me about palette, layout density, and any must-have UI cues.'
      : "I've analyzed your plan. What would you like to refine or discuss?";

  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: initialMessage },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const structuredContext = useMemo(
    () => ({
      plan: context,
      prompt: sourcePrompt,
      mockups: mockups.map((mockup) => ({
        id: mockup.id,
        title: mockup.title,
        url: mockup.url,
        source: mockup.source ?? 'generated',
        preview: mockup.html
          ? mockup.html.slice(0, 4000)
          : undefined,
      })),
    }),
    [context, sourcePrompt, mockups],
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = input;
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('architect-advisor', {
        body: {
          mode: 'consult',
          prompt: userMessage, // Add prompt field for backward compatibility
          messages: newMessages,
          context: structuredContext,
          ownerId,
          sessionId,
        }
      });

      if (error) throw error;

      const responseContent =
        typeof data?.result === 'string'
          ? data.result
          : JSON.stringify(data?.result);
      setMessages([...newMessages, { role: 'assistant', content: responseContent }]);
    } catch (err: any) {
      toast.error(`Consultation error: ${err.message}`);
      // Remove the failed user message on error
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    const summary = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n')
      .trim();

    if (!summary) {
      toast.error('Add at least one clarification before applying.');
      return;
    }

    if (mode === 'mockup' && onMockupBrief) {
      const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
      const refinedBrief = lastAssistantMsg 
        ? `${summary}\n\nConsultant Guidance:\n${lastAssistantMsg.content}`
        : summary;
      onMockupBrief(refinedBrief);
      toast.success('Mockup brief updated. Regenerate lanes to apply changes.');
    } else if (mode === 'plan' && onUpdatePlan) {
      onUpdatePlan(summary);
    }
  };

  const renderMessageContent = (content: string) => {
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const blocks: JSX.Element[] = [];
    let currentList: { type: 'ordered' | 'unordered'; items: string[] } | null =
      null;

    const flushList = () => {
      if (!currentList || currentList.items.length === 0) return;
      const list = currentList;
      blocks.push(
        list.type === 'ordered' ? (
          <ol
            key={`list-${blocks.length}`}
            className="pl-5 space-y-1 text-slate-300 text-sm list-decimal"
          >
            {list.items.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ol>
        ) : (
          <ul
            key={`list-${blocks.length}`}
            className="pl-5 space-y-1 text-slate-300 text-sm list-disc"
          >
            {list.items.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        ),
      );
      currentList = null;
    };

    lines.forEach((line) => {
      if (/^\d+\./.test(line)) {
        if (!currentList || currentList.type !== 'ordered') {
          flushList();
          currentList = { type: 'ordered', items: [] };
        }
        currentList.items.push(line.replace(/^\d+\.\s*/, ''));
      } else if (/^[-*•]/.test(line)) {
        if (!currentList || currentList.type !== 'unordered') {
          flushList();
          currentList = { type: 'unordered', items: [] };
        }
        currentList.items.push(line.replace(/^[-*•]\s*/, ''));
      } else {
        flushList();
        blocks.push(
          <p
            key={`para-${blocks.length}`}
            className="text-slate-200 text-sm leading-relaxed"
          >
            {line}
          </p>,
        );
      }
    });

    flushList();

    if (blocks.length === 0) {
      return <p className="text-slate-200 text-sm">{content}</p>;
    }

    return blocks.map((block, idx) => (
      <Fragment key={idx}>{block}</Fragment>
    ));
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[700px] max-w-[90vw] bg-slate-950 border-l border-slate-800 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <h3 className="font-mono font-bold text-emerald-400">
            {mode === 'mockup' ? 'Mockup Consultant' : 'Architect Consultant'}
          </h3>
          <span className="text-[10px] text-slate-500 border border-slate-700 px-1 rounded">BETA</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 hover:bg-slate-800 text-slate-400">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {(sourcePrompt || mockups.length > 0) && (
            <div className="space-y-3">
              {sourcePrompt && (
                <div className="border border-slate-800 rounded-lg bg-slate-900/70 p-3">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-500 mb-2">
                    <span>Source Brief</span>
                    <span className="text-[10px] text-slate-600">Shared only within this session</span>
                  </div>
                  <ScrollArea className="max-h-40 rounded-md border border-slate-800 bg-slate-950">
                    <pre className="p-3 text-[11px] text-slate-300 whitespace-pre-wrap">
                      {sourcePrompt}
                    </pre>
                  </ScrollArea>
                </div>
              )}
              {mockups.length > 0 && (
                <div className="border border-slate-800 rounded-lg bg-slate-900/60 p-3 space-y-2">
                  <div className="text-xs uppercase tracking-wider text-slate-500">
                    Imported Mockups ({mockups.length})
                  </div>
                  <div className="space-y-2">
                        {mockups.map((lane) => (
                          <div
                            key={lane.id}
                            className="text-xs text-slate-300 flex items-center justify-between gap-2 border border-slate-800 rounded-md px-2 py-1.5"
                          >
                            <div>
                              <p className="font-semibold text-slate-100">{lane.title}</p>
                              <p className="text-[10px] text-slate-500">
                                {lane.source ? lane.source.toUpperCase() : 'GENERATED'}
                              </p>
                            </div>
                            {lane.url ? (
                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="text-[10px] h-6 px-2"
                              >
                                <a href={lane.url} target="_blank" rel="noreferrer">
                                  Open
                                </a>
                              </Button>
                            ) : (
                              <span className="text-[10px] text-slate-500">Pending upload</span>
                            )}
                          </div>
                        ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`
                h-8 w-8 rounded-full flex items-center justify-center shrink-0 border
                ${msg.role === 'assistant' ? 'bg-emerald-950 border-emerald-800 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-300'}
              `}>
                {msg.role === 'assistant' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>
              <div className={`
                rounded-lg p-3 text-sm max-w-[85%] leading-relaxed
                ${msg.role === 'assistant' ? 'bg-slate-900 border border-slate-800 text-slate-300' : 'bg-emerald-900/20 border border-emerald-800/30 text-emerald-100'}
              `}>
                {renderMessageContent(msg.content)}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 flex items-center justify-center">
                <Bot className="h-4 w-4 animate-spin" />
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-500 animate-pulse">
                Thinking...
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Actions Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/30 space-y-3">
        {messages.length > 2 && (
          <Button
            onClick={handleApply}
            className="w-full bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-800/50 font-mono text-xs h-9"
          >
            <Sparkles className="h-3 w-3 mr-2" />
            {mode === 'mockup' ? 'Apply Mockup Brief' : 'Update Plan with Feedback'}
          </Button>
        )}
        
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask a question or suggest a change..."
            className="min-h-[80px] bg-slate-950 border-slate-800 focus:border-emerald-500/50 text-sm pr-10 resize-none"
          />
          <Button 
            size="sm"
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="absolute bottom-2 right-2 h-7 w-7 p-0 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md"
          >
            <Send className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

