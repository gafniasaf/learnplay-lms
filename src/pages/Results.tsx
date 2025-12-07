import { useLocation, useNavigate } from "react-router-dom";
import { Trophy, Home, RotateCcw, Target, TrendingUp, Clock, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useMCP } from "@/hooks/useMCP";
import { getNextLevelId } from "@/lib/levels";
import type { Course } from "@/lib/types/course";

interface ResultsState {
  courseId: string;
  courseTitle: string;
  level: number;
  score: number;
  mistakes: number;
  elapsedSeconds: number;
  accuracy: number;
  finalScore?: number;
}

const Results = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const mcp = useMCP();
  const state = location.state as ResultsState | null;
  const [course, setCourse] = useState<Course | null>(null);

  // Load course to get level information (BEFORE any conditional returns!)
  useEffect(() => {
    // Guard inside effect instead of before it
    if (!state?.courseId) return;
    
    const loadCourse = async () => {
      try {
        const data = await mcp.getCourse(state.courseId) as Course;
        setCourse(data);
      } catch (err) {
        console.error("[Results] Failed to load course:", err);
      }
    };
    loadCourse();
  }, [state?.courseId]);

  // NOW safe to redirect if no state (after all hooks)
  if (!state) {
    navigate("/courses");
    return null;
  }

  const { courseId, courseTitle, level, score, mistakes, elapsedSeconds, accuracy, finalScore } = state;
  const nextLevelId = course ? getNextLevelId(course, level) : null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="play-root w-full bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6 rounded-xl flex items-center justify-center min-h-[600px]">
      <div className="text-center max-w-3xl w-full">
        {/* Trophy Icon */}
        <div className="inline-flex p-8 rounded-2xl bg-primary/10 mb-6 animate-bounce">
          <Trophy className="h-20 w-20 text-primary" aria-hidden="true" />
        </div>
        
        {/* Title */}
        <h1 className="text-4xl font-bold mb-2">Level Complete!</h1>
        <p className="text-xl text-muted-foreground mb-12">
          {courseTitle} - Level {level}
        </p>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-12">
          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="p-6">
              <div className="flex flex-col items-center">
                <Target className="h-8 w-8 text-primary mb-2" aria-hidden="true" />
                <p className="text-sm text-muted-foreground mb-1">Score</p>
                <p className="text-3xl font-bold text-primary" aria-label={`Score: ${score} points`}>
                  {score}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="p-6">
              <div className="flex flex-col items-center">
                <TrendingUp className="h-8 w-8 text-accent mb-2" aria-hidden="true" />
                <p className="text-sm text-muted-foreground mb-1">Accuracy</p>
                <p className="text-3xl font-bold text-accent" aria-label={`Accuracy: ${accuracy} percent`}>
                  {accuracy}%
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="p-6">
              <div className="flex flex-col items-center">
                <div className="h-8 w-8 text-destructive mb-2 flex items-center justify-center font-bold text-xl">
                  ✗
                </div>
                <p className="text-sm text-muted-foreground mb-1">Mistakes</p>
                <p className="text-3xl font-bold text-destructive" aria-label={`Mistakes: ${mistakes}`}>
                  {mistakes}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="p-6">
              <div className="flex flex-col items-center">
                <Clock className="h-8 w-8 mb-2" aria-hidden="true" />
                <p className="text-sm text-muted-foreground mb-1">Time</p>
                <p className="text-3xl font-bold" aria-label={`Time: ${Math.floor(elapsedSeconds / 60)} minutes ${elapsedSeconds % 60} seconds`}>
                  {formatTime(elapsedSeconds)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Final Score (if available) */}
        {finalScore !== undefined && (
          <Card className="mb-8 bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground mb-2">Final Score</p>
              <p className="text-5xl font-bold text-primary">{finalScore}</p>
              <p className="text-sm text-muted-foreground mt-2">Calculated by backend</p>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button 
            size="lg" 
            variant="outline"
            onClick={() => navigate("/courses")}
            className="w-full sm:w-auto"
          >
            <Home className="h-5 w-5 mr-2" aria-hidden="true" />
            Home
          </Button>
          <Button 
            size="lg" 
            variant="outline"
            onClick={() => navigate(`/play/${courseId}?level=${level}`, { replace: true })}
            className="w-full sm:w-auto"
          >
            <RotateCcw className="h-5 w-5 mr-2" aria-hidden="true" />
            Replay Level
          </Button>
          <Button 
            size="lg" 
            disabled={!nextLevelId}
            onClick={() => nextLevelId && navigate(`/play/${courseId}?level=${nextLevelId}`, { replace: true })}
            className="w-full sm:w-auto"
            aria-label={nextLevelId ? `Continue to level ${nextLevelId}` : "All levels complete"}
          >
            {nextLevelId ? (
              <>
                <ArrowRight className="h-5 w-5 mr-2" aria-hidden="true" />
                Continue to Level {nextLevelId}
              </>
            ) : (
              "All Levels Complete"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Results;
