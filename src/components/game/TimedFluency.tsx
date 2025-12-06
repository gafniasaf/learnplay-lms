/** Timed Fluency Sprint - Rapid-fire questions with timer */
import { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

export const TimedFluency = ({ items, duration = 60, onComplete }: any) => {
  const [current, setCurrent] = useState(0);
  const [timeLeft, setTimeLeft] = useState(duration);
  const [answers, setAnswers] = useState<number[]>([]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          onComplete(answers);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleAnswer = (optionIndex: number) => {
    setAnswers(prev => [...prev, optionIndex]);
    if (current < items.length - 1) {
      setCurrent(current + 1);
    } else {
      onComplete([...answers, optionIndex]);
    }
  };

  if (timeLeft === 0) return <div className="text-center text-2xl">Time's Up! Score: {answers.length}/{items.length}</div>;

  const item = items[current];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <span className="text-lg">Question {current + 1} / {items.length}</span>
        <div className="flex items-center gap-2 text-2xl font-bold text-primary">
          <Timer className="h-6 w-6" />
          {timeLeft}s
        </div>
      </div>

      <h2 className="text-3xl font-bold text-center">{item.text}</h2>

      <div className="grid grid-cols-2 gap-4">
        {item.options.map((opt: string, idx: number) => (
          <button
            key={idx}
            onClick={() => handleAnswer(idx)}
            className="p-6 text-xl font-semibold bg-background border-2 rounded-xl hover:border-primary hover:scale-105 transition-all"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
};

