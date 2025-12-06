/** Manipulative Numeric - Interactive number line, fraction bars */
import { useState } from 'react';

export const ManipulativeNumeric = ({ item, onSubmit }: any) => {
  const [value, setValue] = useState(item.min || 0);

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-center">{item.stem.text}</h2>
      
      {/* Number Line */}
      <div className="max-w-3xl mx-auto px-8">
        <input
          type="range"
          min={item.min || 0}
          max={item.max || 100}
          step={item.step || 1}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-sm text-muted-foreground mt-2">
          <span>{item.min || 0}</span>
          <span className="text-2xl font-bold text-primary">{value}</span>
          <span>{item.max || 100}</span>
        </div>
      </div>

      <div className="text-center">
        <button onClick={() => onSubmit(value)} className="px-8 py-3 bg-primary text-white rounded-lg font-semibold">
          Submit Answer: {value}
        </button>
      </div>
    </div>
  );
};

