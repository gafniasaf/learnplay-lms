import React, { useMemo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { sanitizeHtml } from '@/lib/utils/sanitizeHtml';

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
  const stemText = (item?.stem?.text ?? item?.text ?? '') as string;
  const optionsTexts = ((item?.options ?? []) as any[]).map(o => typeof o === 'string' ? o : (o?.text ?? ''));
  const referenceHtml = (item?.reference?.html ?? item?.referenceHtml ?? item?.explain ?? '') as string;

  useEffect(() => {
    setSegment(target.segment);
    setOptionIndex(target.optionIndex ?? 0);
  }, [target.segment, target.optionIndex]);

  const contextPreview = useMemo(() => {
    const safeStem = stemText ? sanitizeHtml(stemText) : '<em>Empty</em>';
    const safeOptions = optionsTexts.map((t) => sanitizeHtml(t));
    const safeReference = referenceHtml ? sanitizeHtml(referenceHtml) : '';

    return (
      <div className="space-y-3 text-sm">
        <div>
          <div className="font-semibold">Course</div>
          <div className="text-muted-foreground">{course?.title}</div>
        </div>
        <div>
          <div className="font-semibold">Stem</div>
          <div
            className="border rounded p-2 bg-white max-h-32 overflow-auto text-xs"
            dangerouslySetInnerHTML={{ __html: safeStem }}
          />
        </div>
        {safeOptions?.length > 0 && (
          <div>
            <div className="font-semibold">Options</div>
            <ul className="list-disc ml-4 text-xs text-muted-foreground">
              {safeOptions.map((t, i) => (
                <li key={i} dangerouslySetInnerHTML={{ __html: t }} />
              ))}
            </ul>
          </div>
        )}
        {!!safeReference && (
          <div>
            <div className="font-semibold">Explanation</div>
            <div
              className="border rounded p-2 bg-white max-h-32 overflow-auto text-xs"
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
      }
    } finally {
      setLoading(false);
    }
  };

  const optionLabel = (i: number) => `Option ${String.fromCharCode(65 + i)}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white w-full max-w-5xl h-[80vh] rounded-lg overflow-hidden shadow-2xl flex">
        {/* Left: context */}
        <div className="w-1/3 border-r p-4 bg-gray-50">{contextPreview}</div>
        {/* Right: chat */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between border-b p-4">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold">AI Rewrite Assistant</h3>
              <div className="flex items-center gap-2">
                <select value={segment} onChange={(e)=>setSegment(e.target.value as any)} className="border rounded p-1 text-sm">
                  <option value="stem">Target: Stem</option>
                  <option value="reference">Target: Explanation</option>
                  <option value="option">Target: Option</option>
                </select>
                {segment === 'option' && (
                  <select value={optionIndex} onChange={(e)=>setOptionIndex(Number(e.target.value))} className="border rounded p-1 text-sm">
                    {optionsTexts.map((_, i) => (
                      <option key={i} value={i}>{optionLabel(i)}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3 bg-white">
            {messages.map((m, i) => (
              <div key={i} className={m.role==='user' ? 'text-right' : ''}>
                <div className={`inline-block max-w-[80%] px-3 py-2 rounded ${m.role==='user' ? 'bg-blue-50' : 'bg-gray-100'}`}>
                  {m.role==='assistant' ? (
                    <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.content) }} />
                  ) : (
                    <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t p-3 flex gap-2">
            <Textarea value={prompt} onChange={(e)=>setPrompt(e.target.value)} placeholder="Tell the assistant how to improve the text…" className="flex-1" rows={3} />
            <Button onClick={send} disabled={loading || !prompt.trim()}>{loading ? 'Thinking…' : 'Send'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
};
