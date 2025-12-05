export function FactoryGuide() {
  const steps = [
    {
      title: 'Describe It',
      detail: 'Open /architect → “Create New”. Paste your idea in plain English and click “Design My System”.',
    },
    {
      title: 'Review & Refine',
      detail:
        'Use “Consult / Refine” to chat with the Architect. Capture Discovery Notes until you’re happy with the plan.',
    },
    {
      title: 'Hand Off to Cursor',
      detail:
        'Click “Download PLAN.md”. Share the generated link with Cursor and paste the “Copy Cursor Instructions” text.',
    },
  ];

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 md:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500 font-mono">Factory Checklist</p>
          <h3 className="text-lg font-semibold text-slate-100">Zero-to-Plan in 3 steps</h3>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {steps.map((step, i) => (
          <div
            key={step.title}
            className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 flex flex-col gap-2"
          >
            <div className="text-xs font-mono text-cyan-400 uppercase tracking-wider">
              Step {i + 1}
            </div>
            <div className="text-sm font-semibold text-slate-100">{step.title}</div>
            <p className="text-xs text-slate-400 leading-relaxed">{step.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

