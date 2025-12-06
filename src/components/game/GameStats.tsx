import { Trophy, Target, XCircle, Clock } from "lucide-react";

interface GameStatsProps {
  score: number;
  mistakes: number;
  itemsRemaining: number;
  elapsedTime: number;
}

export const GameStats = ({ score, mistakes, itemsRemaining, elapsedTime }: GameStatsProps) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const stats = [
    { icon: Trophy, label: "Score", value: score, color: "text-primary" },
    { icon: Target, label: "Remaining", value: itemsRemaining, color: "text-accent" },
    { icon: XCircle, label: "Mistakes", value: mistakes, color: "text-destructive" },
    { icon: Clock, label: "Time", value: formatTime(elapsedTime), color: "text-muted-foreground" },
  ];

  return (
    <div className="flex items-center gap-2" role="region" aria-label="Game statistics">
      {stats.map(({ icon: Icon, label, value, color }) => (
        <div
          key={label}
          className="flex items-center gap-1"
          role="status"
          aria-label={`${label}: ${value}`}
        >
          <Icon className={`h-3.5 w-3.5 ${color}`} aria-hidden="true" />
          <span className="text-xs font-semibold" aria-live="polite">{value}</span>
        </div>
      ))}
    </div>
  );
};
