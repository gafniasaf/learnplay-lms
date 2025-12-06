import React, { useEffect, useRef } from 'react';

type WrongModalProps = {
  open: boolean;
  onClose: () => void;
  item: {
    text?: string;           // some courses use "text", others "stem"
    stem?: string;
    options: string[];
    correctIndex: number;
    explain?: string;
    example?: string;
    mode?: 'options' | 'numeric';
    answer?: number;
  };
};

export default function WrongModal({ open, onClose, item }: WrongModalProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const labelId = 'wrong-modal-title';

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const stem = item.stem ?? item.text ?? '';
  const isNumericMode = item.mode === 'numeric';
  const correct = isNumericMode 
    ? item.answer?.toString() || ''
    : item.options[item.correctIndex] ?? '';
  // Replace both [blank] and _ (single underscore used as placeholder)
  const filled = (stem || '').replace(/\[blank\]|_/g, correct);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 id={labelId} className="text-lg font-semibold mb-2">Explanation</h2>

        <div className="mb-3 text-sm">
          <div className="font-medium">Correct sentence</div>
          <div className="mt-1">{filled}</div>
        </div>

        <div className="mb-3 text-sm">
          <div className="font-medium">Correct answer</div>
          <div className="mt-1">{correct}</div>
        </div>

        {item.explain ? (
          <div className="mb-4 text-sm text-gray-700">{item.explain}</div>
        ) : null}

        {item.example ? (
          <div className="mb-4 text-sm text-gray-600">Example: {item.example}</div>
        ) : null}

        <div className="flex justify-end">
          <button
            ref={closeRef}
            className="px-4 py-2 rounded bg-blue-600 text-white"
            onClick={onClose}
            aria-label="Close explanation"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
