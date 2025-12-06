/** Ordering/Sequencing - Arrange steps in correct order */
import { useState } from 'react';
import { GripVertical } from 'lucide-react';

interface OrderingProps {
  item: {
    mode: 'ordering';
    stem: { text: string };
    steps: string[];
    correctOrder: number[];
  };
  onSubmit: (order: number[]) => void;
}

export const OrderingSequence = ({ item, onSubmit }: OrderingProps) => {
  const [order, setOrder] = useState<string[]>([...item.steps]);

  const moveItem = (from: number, to: number) => {
    const newOrder = [...order];
    const [removed] = newOrder.splice(from, 1);
    newOrder.splice(to, 0, removed);
    setOrder(newOrder);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-center">{item.stem.text}</h2>
      <div className="space-y-2">
        {order.map((step, idx) => (
          <div key={step} className="flex items-center gap-3 p-4 bg-background border-2 rounded-lg">
            <GripVertical className="cursor-grab" />
            <span className="font-bold text-muted-foreground">{idx + 1}.</span>
            <span className="flex-1">{step}</span>
            {idx > 0 && <button onClick={() => moveItem(idx, idx - 1)}>↑</button>}
            {idx < order.length - 1 && <button onClick={() => moveItem(idx, idx + 1)}>↓</button>}
          </div>
        ))}
      </div>
      <button onClick={() => onSubmit(order.map(s => item.steps.indexOf(s)))} className="w-full py-3 bg-primary text-white rounded-lg">
        Submit Order
      </button>
    </div>
  );
};

