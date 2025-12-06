interface ProgressBarProps {
  progress: number;
  className?: string;
}

export const ProgressBar = ({ progress, className = "" }: ProgressBarProps) => {
  const percentage = Math.round(progress * 100);

  return (
    <div className={`w-full ${className}`} role="region" aria-label="Progress indicator">
      <div className="flex items-center justify-between mb-2 text-sm">
        <span className="font-medium text-muted-foreground">Progress</span>
        <span className="font-bold text-primary" aria-live="polite">
          {percentage}%
        </span>
      </div>
      <div 
        className="h-3 bg-secondary rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${percentage} percent complete`}
      >
        <div
          className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
