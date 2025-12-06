/** Graph Interpretation - Read charts and answer questions */
export const GraphInterpretation = ({ item, onSelect }: any) => (
  <div className="space-y-6">
    <div className="max-w-3xl mx-auto">
      <img src={item.graphUrl} alt="Graph" className="w-full rounded-xl shadow-lg" />
    </div>
    <h2 className="text-xl font-bold text-center">{item.stem.text}</h2>
    <div className="grid gap-3 max-w-2xl mx-auto">
      {item.options.map((opt: string, idx: number) => (
        <button
          key={idx}
          onClick={() => onSelect(idx)}
          className="p-4 text-left bg-background border-2 rounded-lg hover:border-primary transition"
        >
          {opt}
        </button>
      ))}
    </div>
  </div>
);

