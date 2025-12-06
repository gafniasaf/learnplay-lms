/**
 * Visual MCQ Component
 * 
 * Multiple choice with image options instead of text
 */

import { AspectRatio } from "@/components/ui/aspect-ratio";

interface VisualMCQOption {
  text: string;
  image: string;
}

interface VisualMCQProps {
  item: {
    id: number;
    mode: 'visual-mcq';
    stem: { text: string };
    options: VisualMCQOption[];
    correctIndex: number;
  };
  onSelect: (index: number) => void;
  selectedIndex?: number;
  showFeedback?: boolean;
  isCorrect?: boolean;
}

export const VisualMCQ = ({
  item,
  onSelect,
  selectedIndex,
  showFeedback = false,
  isCorrect,
}: VisualMCQProps) => {
  return (
    <div className="space-y-6">
      {/* Stem */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          {item.stem.text}
        </h2>
      </div>

      {/* Image Options Grid */}
      <div className="grid grid-cols-2 gap-4 max-w-3xl mx-auto">
        {item.options.map((option, index) => {
          const isSelected = selectedIndex === index;
          const showCorrect = showFeedback && index === item.correctIndex;
          const showWrong = showFeedback && isSelected && !isCorrect;

          return (
            <button
              key={index}
              onClick={() => !showFeedback && onSelect(index)}
              disabled={showFeedback}
              className={`
                relative rounded-xl overflow-hidden border-4 transition-all
                ${isSelected ? 'border-primary ring-4 ring-primary/30' : 'border-gray-200'}
                ${showCorrect ? 'border-green-500 ring-4 ring-green-500/30' : ''}
                ${showWrong ? 'border-red-500 ring-4 ring-red-500/30' : ''}
                ${!showFeedback ? 'hover:border-primary/50 cursor-pointer' : 'cursor-default'}
                disabled:opacity-70
              `}
            >
              {/* Image (16:9, smart contain to avoid cropping) */}
              <AspectRatio ratio={16 / 9}>
                <img
                  src={option.image}
                  alt={option.text}
                  role="img"
                  className="w-full h-full object-contain bg-black/5"
                />
              </AspectRatio>

              {/* Label */}
              <div className="p-4 bg-white">
                <p className="text-lg font-semibold text-center">
                  {option.text}
                </p>
              </div>

              {/* Feedback Indicator */}
              {showCorrect && (
                <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                  <div className="bg-green-500 text-white rounded-full p-4">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              )}

              {showWrong && (
                <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                  <div className="bg-red-500 text-white rounded-full p-4">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

