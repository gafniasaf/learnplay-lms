import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { sanitizeHtml } from '@/lib/utils/sanitizeHtml';
import { toast } from 'sonner';

interface ChatTarget {
  segment: 'stem' | 'reference' | 'option';
  optionIndex?: number;
}

interface AIRewriteChatPanelProps {
  open: boolean;
  onClose: () => void;
  course: any;
  item: any;
  target: ChatTarget;
  onRewrite: (target: ChatTarget, userPrompt: string) => Promise<{ original: string; proposed: string } | null>;
}

export const AIRewriteChatPanel: React.FC<AIRewriteChatPanelProps> = ({ open, onClose, course, item, target, onRewrite }) => {
  const [segment, setSegment] = useState<'stem' | 'reference' | 'option'>(target.segment);
  const [optionIndex, setOptionIndex] = useState<number>(target.optionIndex ?? 0);
  const [prompt, setPrompt] = useState('Make it clearer and age-appropriate.');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const autoSentRef = useRef(false);
  const stemText = (item?.stem?.text ?? item?.text ?? '') as string;
  const optionsTexts = ((item?.options ?? []) as any[]).map(o => typeof o === 'string' ? o : (o?.text ?? ''));
  const referenceHtml = (item?.reference?.html ?? item?.referenceHtml ?? item?.explain ?? '') as string;

  useEffect(() => {
    setSegment(target.segment);
    setOptionIndex(target.optionIndex ?? 0);
  }, [target.segment, target.optionIndex]);

  // Auto-run once on open so "AI Rewrite" immediately produces output.
  useEffect(() => {
    if (!open) return;
    autoSentRef.current = false;
    // Reset for a fresh chat per open.
    setMessages([]);
    // Keep default prompt if user hasn't typed anything.
    setPrompt((p) => (p && p.trim().length > 0 ? p : 'Make it clearer and age-appropriate.'));
  }, [open]);

  const contextPreview = useMemo(() => {
    const safeStem = stemText ? sanitizeHtml(stemText) : '<em>Empty</em>';
    const safeOptions = optionsTexts.map((t) => sanitizeHtml(t));
    const safeReference = referenceHtml ? sanitizeHtml(referenceHtml) : '';

    return (
      <div className="space-y-3 text-sm">
        <div>
          <div className="font-semibold text-foreground">Course</div>
          <div className="text-muted-foreground">{course?.title}</div>
        </div>
        <div>
          <div className="font-semibold text-foreground">Stem</div>
          <div
            className="border border-input rounded p-2 bg-background max-h-32 overflow-auto text-xs text-foreground"
            dangerouslySetInnerHTML={{ __html: safeStem }}
          />
        </div>
        {safeOptions?.length > 0 && (
          <div>
            <div className="font-semibold text-foreground">Options</div>
            <ul className="list-disc ml-4 text-xs text-muted-foreground">
              {safeOptions.map((t, i) => (
                <li key={i} dangerouslySetInnerHTML={{ __html: t }} />
              ))}
            </ul>
          </div>
        )}
        {!!safeReference && (
          <div>
            <div className="font-semibold text-foreground">Explanation</div>
            <div
              className="border border-input rounded p-2 bg-background max-h-32 overflow-auto text-xs text-foreground"
              dangerouslySetInnerHTML={{ __html: safeReference }}
            />
          </div>
        )}
      </div>
    );
  }, [course?.title, stemText, optionsTexts, referenceHtml]);

  if (!open) return null;

  const send = async () => {
    if (!prompt?.trim()) return;
    setLoading(true);
    setMessages(m => [...m, { role: 'user', content: prompt }]);
    const aggregatePrompt = messages.filter(m => m.role==='user').map(m=>m.content).concat(prompt).join('\n\n');
    setPrompt('');
    try {
      const res = await onRewrite({ segment, optionIndex: segment === 'option' ? optionIndex : undefined }, aggregatePrompt);
      if (res) {
        setMessages(m => [...m, { role: 'assistant', content: res.proposed }]);
      } else {
        toast.error('AI rewrite failed');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI rewrite failed');
    } finally {
      setLoading(false);
    }
  };

  // Fire the first request automatically (only once per open).
  useEffect(() => {
    if (!open) return;
    if (loading) return;
    if (autoSentRef.current) return;
    if (!prompt?.trim()) return;
    if (messages.length > 0) return;
    autoSentRef.current = true;
    void send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const optionLabel = (i: number) => `Option ${String.fromCharCode(65 + i)}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-background w-full max-w-5xl h-[80vh] rounded-lg overflow-hidden shadow-2xl flex">
        {/* Left: context */}
        <div className="w-1/3 border-r p-4 bg-muted">{contextPreview}</div>
        {/* Right: chat */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between border-b p-4 bg-background">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-foreground">AI Rewrite Assistant</h3>
              <div className="flex items-center gap-2">
                <select 
                  value={segment} 
                  onChange={(e)=>setSegment(e.target.value as any)} 
                  className="border border-input rounded px-2 py-1 text-sm bg-background text-foreground"
                >
                  <option value="stem">Target: Stem</option>
                  <option value="reference">Target: Explanation</option>
                  <option value="option">Target: Option</option>
                </select>
                {segment === 'option' && (
                  <select 
                    value={optionIndex} 
                    onChange={(e)=>setOptionIndex(Number(e.target.value))} 
                    className="border border-input rounded px-2 py-1 text-sm bg-background text-foreground"
                  >
                    {optionsTexts.map((_, i) => (
                      <option key={i} value={i}>{optionLabel(i)}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3 bg-background">
            {messages.map((m, i) => (
              <div key={i} className={m.role==='user' ? 'text-right' : ''}>
                <div className={`inline-block max-w-[80%] px-3 py-2 rounded text-foreground ${m.role==='user' ? 'bg-primary/10' : 'bg-muted'}`}>
                  {m.role==='assistant' ? (
                    <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.content) }} />
                  ) : (
                    <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t p-3 flex gap-2 bg-background">
            <Textarea value={prompt} onChange={(e)=>setPrompt(e.target.value)} placeholder="Tell the assistant how to improve the text…" className="flex-1" rows={3} />
            <Button onClick={send} disabled={loading || !prompt.trim()}>{loading ? 'Thinking…' : 'Send'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
};
