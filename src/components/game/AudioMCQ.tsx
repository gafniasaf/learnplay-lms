/**
 * Audio MCQ Component
 * Listen to audio prompt, then answer multiple choice
 */

import { useState, useRef } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AudioMCQProps {
  item: {
    id: number;
    mode: 'audio-mcq';
    audioUrl: string;
    transcript?: string;
    options: string[];
    correctIndex: number;
  };
  onSelect: (index: number) => void;
  selectedIndex?: number;
  showFeedback?: boolean;
  isCorrect?: boolean;
}

export const AudioMCQ = ({ item, onSelect, selectedIndex, showFeedback, isCorrect }: AudioMCQProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const restart = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play();
    setIsPlaying(true);
  };

  return (
    <div className="space-y-8">
      {/* Audio Player */}
      <div className="max-w-md mx-auto">
        <div className="bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl p-8 text-white shadow-2xl">
          <div className="flex items-center justify-center gap-4 mb-4">
            <Button
              size="lg"
              variant="secondary"
              onClick={togglePlay}
              className="rounded-full w-16 h-16"
            >
              {isPlaying ? <Pause className="h-8 w-8" /> : <Play className="h-8 w-8 ml-1" />}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={restart}
              className="rounded-full w-16 h-16"
            >
              <RotateCcw className="h-6 w-6" />
            </Button>
          </div>
          <p className="text-center text-lg font-medium opacity-90">
            Listen and answer the question
          </p>
          <audio
            ref={audioRef}
            src={item.audioUrl}
            onEnded={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        </div>
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
              disabled={showFeedback}
              className={`
                p-6 rounded-xl text-lg font-medium transition-all text-center
                ${isSelected ? 'bg-primary text-primary-foreground ring-4 ring-primary/30' : 'bg-background border-2'}
                ${showCorrect ? 'bg-green-500 text-white ring-4 ring-green-500/30' : ''}
                ${showWrong ? 'bg-red-500 text-white ring-4 ring-red-500/30' : ''}
                ${!showFeedback ? 'hover:border-primary cursor-pointer' : 'cursor-default'}
              `}
            >
              {option}
            </button>
          );
        })}
      </div>

      {item.transcript && (
        <details className="max-w-2xl mx-auto text-sm text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">Show transcript</summary>
          <p className="mt-2 p-4 bg-muted rounded-lg">{item.transcript}</p>
        </details>
      )}
    </div>
  );
};

