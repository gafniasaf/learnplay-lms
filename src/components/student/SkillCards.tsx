import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import { Target, TrendingUp, Clock, BookOpen } from "lucide-react";
import { useMemo, useState } from "react";
import type { MasteryStateWithKO } from "@/lib/types/knowledgeMap";
import { BrowseAllSkills } from "./BrowseAllSkills";
import { useStudentSkills } from "@/hooks/useKnowledgeMap";

interface SkillCardsProps {
  studentId: string;
}

/**
 * SkillCards component - Student's "My Focus" view
 * 
 * Shows 2-4 Knowledge Objectives grouped by priority:
 * - Practice Now: KOs with mastery 0.3-0.69 (yellow zone)
 * - Review Soon: Mastered KOs aging >10 days (needs refresher)
 * 
 * Replaces/augments the RecommendationsCard with KO-based guidance
 */
export function SkillCards({ studentId }: SkillCardsProps) {
  const [showBrowseAll, setShowBrowseAll] = useState(false);

  const { skills, isLoading, isError, error, refetch } = useStudentSkills({
    studentId,
    limit: 500,
    offset: 0,
  });

  const practiceNow = useMemo(() => {
    return skills
      .filter((s) => s.status === "in-progress" && s.mastery >= 0.3 && s.mastery < 0.7)
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 3);
  }, [skills]);

  const reviewSoon = useMemo(() => {
    return skills
      .filter((s) => s.status === "mastered" && s.daysSinceLastPractice >= 10)
      .sort((a, b) => b.daysSinceLastPractice - a.daysSinceLastPractice)
      .slice(0, 2);
  }, [skills]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">My Skills Focus</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Target className="h-8 w-8 mx-auto text-muted-foreground mb-2" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Loading your skill recommendations...</p>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">My Skills Focus</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Target className="h-8 w-8 mx-auto text-muted-foreground mb-2" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Failed to load skills{error?.message ? `: ${error.message}` : "."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const hasFocus = practiceNow.length > 0 || reviewSoon.length > 0;

  if (!hasFocus) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">My Skills Focus</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowBrowseAll(true)}
            >
              <BookOpen className="h-3.5 w-3.5 mr-1" />
              Browse All
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Target className="h-8 w-8 mx-auto text-success mb-2" aria-hidden="true" />
          <p className="text-sm font-medium mb-1">All caught up!</p>
          <p className="text-xs text-muted-foreground">
            You're mastering your skills. Keep practicing to maintain your progress.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">My Skills Focus</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowBrowseAll(true)}
          >
            <BookOpen className="h-3.5 w-3.5 mr-1" />
            Browse All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Practice Now section */}
        {practiceNow.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Practice Now
              </h3>
            </div>
            <div className="space-y-2">
              {practiceNow.slice(0, 3).map((skill) => (
                <SkillFocusCard key={skill.ko.id} skill={skill} studentId={studentId} />
              ))}
            </div>
          </div>
        )}

        {/* Review Soon section */}
        {reviewSoon.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-info" aria-hidden="true" />
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Review Soon
              </h3>
            </div>
            <div className="space-y-2">
              {reviewSoon.slice(0, 2).map((skill) => (
                <SkillFocusCard key={skill.ko.id} skill={skill} studentId={studentId} variant="review" />
              ))}
            </div>
          </div>
        )}
      </CardContent>
      
      {/* BrowseAllSkills modal */}
      <BrowseAllSkills
        isOpen={showBrowseAll}
        onClose={() => setShowBrowseAll(false)}
        studentId={studentId}
      />
    </Card>
  );
}

/**
 * Individual skill card within the focus list
 */
function SkillFocusCard({ 
  skill, 
  studentId,
  variant = "practice" 
}: { 
  skill: MasteryStateWithKO; 
  studentId: string;
  variant?: "practice" | "review";
}) {
  const masteryPct = Math.round(skill.mastery * 100);
  const statusColor = getStatusColor(skill.mastery);
  const daysSince = variant === "review" ? skill.daysSinceLastPractice : null;

  // For practice view, show recommended course to practice
  // For review view, show "needs refresher" message
  const actionMessage = variant === "review" 
    ? "Refresh your mastery"
    : "Build your skills";

  return (
    <div className={`p-3 rounded-md border ${statusColor.bg} space-y-2.5`}>
      {/* Header: Skill name + mastery badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium leading-tight truncate">{skill.ko.name}</h4>
          {skill.ko.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {skill.ko.description}
            </p>
          )}
        </div>
        <Badge 
          variant="outline" 
          className={`flex-shrink-0 ${statusColor.badge}`}
        >
          {masteryPct}%
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <Progress value={masteryPct} className="h-1.5" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{actionMessage}</span>
          {daysSince !== null && variant === "review" && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {daysSince}d ago
            </span>
          )}
          {skill.evidenceCount > 0 && variant === "practice" && (
            <span>{skill.evidenceCount} attempts</span>
          )}
        </div>
      </div>

      {/* Action button */}
      <Button 
        size="sm" 
        className="w-full h-8 text-xs"
        asChild
      >
        <Link
          to={`/courses?recommendedFor=${encodeURIComponent(skill.ko.id)}&studentId=${encodeURIComponent(
            studentId
          )}`}
        >
          <BookOpen className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
          Find Practice
        </Link>
      </Button>
    </div>
  );
}

/**
 * Get color scheme based on mastery level
 */
function getStatusColor(mastery: number): { bg: string; badge: string } {
  if (mastery < 0.5) {
    return {
      bg: "bg-destructive/5 border-destructive/20",
      badge: "border-destructive/30 text-destructive"
    };
  }
  if (mastery < 0.7) {
    return {
      bg: "bg-warning/5 border-warning/20",
      badge: "border-warning/30 text-warning"
    };
  }
  return {
    bg: "bg-success/5 border-success/20",
    badge: "border-success/30 text-success"
  };
}
