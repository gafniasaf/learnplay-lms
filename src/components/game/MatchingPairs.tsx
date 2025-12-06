/**
 * Matching Pairs - Connect related items
 */

import { useState } from 'react';

interface Pair {
  left: string;
  right: string;
}

interface MatchingPairsProps {
  item: {
    id: number;
    mode: 'matching';
    stem: { text: string };
    pairs: Pair[];
  };
  onComplete: (matches: Record<string, string>) => void;
}

export const MatchingPairs = ({ item, onComplete }: MatchingPairsProps) => {
  const [selected, setSelected] = useState<{ left?: string; right?: string }>({});
  const [matches, setMatches] = useState<Record<string, string>>({});

  const handleSelect = (side: 'left' | 'right', value: string) => {
    const newSelected = { ...selected, [side]: value };
    setSelected(newSelected);

    if (newSelected.left && newSelected.right) {
      setMatches(prev => ({ ...prev, [newSelected.left!]: newSelected.right! }));
      setSelected({});
    }
  };

  const isMatched = (side: 'left' | 'right', value: string) => {
    return side === 'left' ? matches[value] !== undefined : Object.values(matches).includes(value);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-center">{item.stem.text}</h2>
      
      <div className="grid grid-cols-2 gap-8 max-w-3xl mx-auto">
        <div className="space-y-3">
          {item.pairs.map(pair => (
            <button
              key={pair.left}
              onClick={() => handleSelect('left', pair.left)}
              disabled={isMatched('left', pair.left)}
              className={`
                w-full p-4 rounded-lg text-left transition-all
                ${selected.left === pair.left ? 'bg-primary text-primary-foreground' : 'bg-background border-2'}
                ${isMatched('left', pair.left) ? 'opacity-50' : 'hover:border-primary'}
              `}
            >
              {pair.left}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {item.pairs.map(pair => (
            <button
              key={pair.right}
              onClick={() => handleSelect('right', pair.right)}
              disabled={isMatched('right', pair.right)}
              className={`
                w-full p-4 rounded-lg text-left transition-all
                ${selected.right === pair.right ? 'bg-primary text-primary-foreground' : 'bg-background border-2'}
                ${isMatched('right', pair.right) ? 'opacity-50' : 'hover:border-primary'}
              `}
            >
              {pair.right}
            </button>
          ))}
        </div>
      </div>

      {Object.keys(matches).length === item.pairs.length && (
        <div className="text-center">
          <button
            onClick={() => onComplete(matches)}
            className="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-semibold"
          >
            Submit All Pairs
          </button>
        </div>
      )}
    </div>
  );
};

