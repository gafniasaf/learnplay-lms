/**
 * Drag and Drop Classification
 * Drag items into correct categories
 */

import { useState } from 'react';
import { GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DragDropItem {
  id: string;
  text: string;
  category: string;
}

interface DragDropProps {
  item: {
    id: number;
    mode: 'drag-drop';
    stem: { text: string };
    items: DragDropItem[];
    categories: string[];
  };
  onComplete: (placements: Record<string, string>) => void;
}

export const DragDropClassify = ({ item, onComplete }: DragDropProps) => {
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  const handleDragStart = (itemId: string) => setDraggedItem(itemId);
  
  const handleDrop = (category: string) => {
    if (!draggedItem) return;
    setPlacements(prev => ({ ...prev, [draggedItem]: category }));
    setDraggedItem(null);
  };

  const handleSubmit = () => {
    if (Object.keys(placements).length === item.items.length) {
      onComplete(placements);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-center">{item.stem.text}</h2>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Items to drag */}
        <div className="space-y-3">
          <h3 className="font-semibold">Items:</h3>
          {item.items.filter(i => !placements[i.id]).map(i => (
            <div
              key={i.id}
              draggable
              onDragStart={() => handleDragStart(i.id)}
              className="p-4 bg-background border-2 rounded-lg cursor-move flex items-center gap-2 hover:border-primary"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              {i.text}
            </div>
          ))}
        </div>

        {/* Drop zones */}
        <div className="space-y-3">
          <h3 className="font-semibold">Categories:</h3>
          {item.categories.map(cat => (
            <div
              key={cat}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(cat)}
              className="min-h-24 p-4 border-2 border-dashed rounded-lg"
            >
              <p className="font-medium mb-2">{cat}</p>
              <div className="space-y-2">
                {item.items.filter(i => placements[i.id] === cat).map(i => (
                  <div key={i.id} className="p-2 bg-primary/10 rounded text-sm">
                    {i.text}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center">
        <Button
          onClick={handleSubmit}
          disabled={Object.keys(placements).length !== item.items.length}
          size="lg"
        >
          Submit
        </Button>
      </div>
    </div>
  );
};

