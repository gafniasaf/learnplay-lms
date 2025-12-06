interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
      aria-busy="true"
      aria-live="polite"
    />
  );
}

export function JobCardSkeleton() {
  return (
    <div className="p-3 border rounded-md space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-1/2 mb-4" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 flex-1" />
        </div>
      ))}
    </div>
  );
}

export function MetricSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-6 w-32" />
    </div>
  );
}
