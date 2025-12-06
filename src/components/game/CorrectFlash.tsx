import { CheckCircle } from "lucide-react";

export const CorrectFlash = () => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-green-500/95 animate-fade-in pointer-events-none"
    >
      <div className="flex flex-col items-center gap-4 animate-scale-in">
        <CheckCircle 
          size={160} 
          className="text-white drop-shadow-2xl" 
          strokeWidth={3}
          aria-hidden="true" 
        />
        <span className="text-4xl font-bold text-white drop-shadow-lg">Correct!</span>
        <span className="sr-only">Correct answer</span>
      </div>
    </div>
  );
};
