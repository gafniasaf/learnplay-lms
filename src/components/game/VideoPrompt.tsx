/**
 * Video Prompt Component
 * Watch video, then answer MCQ
 */

import { useState } from 'react';

interface VideoPromptProps {
  item: {
    id: number;
    mode: 'video-prompt';
    videoUrl: string;
    stem: { text: string };
    options: string[];
    correctIndex: number;
  };
  onSelect: (index: number) => void;
  selectedIndex?: number;
  showFeedback?: boolean;
  isCorrect?: boolean;
}

export const VideoPrompt = ({ item, onSelect, selectedIndex, showFeedback, isCorrect }: VideoPromptProps) => {
  const [videoWatched, setVideoWatched] = useState(false);

  return (
    <div className="space-y-6">
      {/* Video */}
      <div className="max-w-3xl mx-auto">
        <video
          src={item.videoUrl}
          controls
          className="w-full rounded-xl shadow-2xl"
          onEnded={() => setVideoWatched(true)}
        />
      </div>

      {/* Question */}
      <div className="text-center">
        <h2 className="text-2xl font-bold">{item.stem.text}</h2>
      </div>

      {/* Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
        {item.options.map((option, index) => {
          const isSelected = selectedIndex === index;
          const showCorrect = showFeedback && index === item.correctIndex;
          const showWrong = showFeedback && isSelected && !isCorrect;

          return (
            <button
              key={index}
              onClick={() => !showFeedback && onSelect(index)}
              disabled={showFeedback || !videoWatched}
              className={`
                p-6 rounded-xl text-lg transition-all
                ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-background border-2'}
                ${showCorrect ? 'bg-green-500 text-white' : ''}
                ${showWrong ? 'bg-red-500 text-white' : ''}
                ${!showFeedback && videoWatched ? 'hover:border-primary cursor-pointer' : ''}
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {option}
            </button>
          );
        })}
      </div>

      {!videoWatched && (
        <p className="text-center text-muted-foreground text-sm">
          Watch the video to unlock the answer options
        </p>
      )}
    </div>
  );
};

