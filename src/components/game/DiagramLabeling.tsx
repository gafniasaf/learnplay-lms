/** Diagram Labeling - Click to label parts of an image */
import { useState } from 'react';

export const DiagramLabeling = ({ item, onSubmit }: any) => {
  const [labels, setLabels] = useState<Record<string, string>>({});

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-center">{item.stem.text}</h2>
      <div className="relative max-w-3xl mx-auto">
        <img src={item.diagramUrl} alt="Diagram" className="w-full" />
        {item.labelPoints.map((point: any) => (
          <button
            key={point.id}
            style={{ top: `${point.y}%`, left: `${point.x}%` }}
            className="absolute w-8 h-8 bg-primary text-white rounded-full"
            onClick={() => {
              const label = prompt(`Label for point ${point.id}:`);
              if (label) setLabels(prev => ({ ...prev, [point.id]: label }));
            }}
          >
            {point.id}
          </button>
        ))}
      </div>
      <button onClick={() => onSubmit(labels)} className="w-full py-3 bg-primary text-white rounded-lg">
        Submit Labels
      </button>
    </div>
  );
};

