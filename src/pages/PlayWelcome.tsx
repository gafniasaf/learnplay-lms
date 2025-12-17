import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Trophy } from "lucide-react";
import { useMCP } from "@/hooks/useMCP";
import type { Course } from "@/lib/types/course";
import { useCoursePreloader } from "@/hooks/useCoursePreloader";
import { getApiMode } from "@/lib/api";

export default function PlayWelcome() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [total, setTotal] = useState(0);

  const mcp = useMCP();
  
  useEffect(() => {
    if (!courseId) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const c = await mcp.getCourse(courseId);
        if (!mounted) return;
        setCourse(c as unknown as Course);
        setError(null);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "Failed to load course");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [courseId]);

  useCoursePreloader(course, {
    onProgress: (l, t) => { setLoaded(l); setTotal(t); },
  });

  const handleStart = () => {
    // Preserve assignmentId, level, admin, etc.
    const paramsStr = searchParams.toString();
    navigate(`/play/${courseId}${paramsStr ? `?${paramsStr}` : ''}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center">
        <div className="text-center" role="status" aria-live="polite">
          <div className="inline-flex p-6 rounded-2xl bg-primary/10 mb-4 animate-pulse">
            <Trophy className="h-12 w-12 text-primary" />
          </div>
          <p className="text-xl font-medium">Preparing course…</p>
          <p className="text-sm text-muted-foreground mt-2">Mode: {getApiMode()}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-destructive/5 via-background to-destructive/5 flex items-center justify-center p-6">
        <div className="text-center max-w-md" role="alert">
          <h1 className="text-2xl font-bold mb-4">Error</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={() => navigate('/courses')}>Back to Courses</Button>
        </div>
      </div>
    );
  }

  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-card border rounded-xl shadow p-6">
        <div className="flex items-center gap-3 mb-2">
          <Trophy className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">{course?.title || 'Course'}</h1>
        </div>
        {course?.description && (
          <p className="text-sm text-muted-foreground mb-4">{course.description}</p>
        )}

        {/* Preload progress - only show if there are images to preload */}
        {total > 0 ? (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Preloading images</span>
              <span>{loaded}/{total}</span>
            </div>
            <div className="h-2 bg-muted rounded overflow-hidden">
              <div 
                className="h-2 bg-primary rounded transition-all duration-300 ease-out" 
                style={{ width: `${pct}%` }} 
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {loaded === total 
                ? '✓ All images ready!' 
                : 'You can start now; the rest will continue loading in the background.'}
            </p>
          </div>
        ) : (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span>Ready to start</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={handleStart}>Start</Button>
          <Link to={`/play/${courseId}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`} className="text-sm underline text-primary">
            Skip preloading
          </Link>
        </div>
      </div>
    </div>
  );
}
