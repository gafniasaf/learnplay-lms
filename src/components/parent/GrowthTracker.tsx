import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  BookOpen,
  Plus,
  Lock,
  Target,
  CheckCircle2,
} from "lucide-react";
import { useState } from "react";
import type { DomainGrowthSummary } from "@/lib/types/knowledgeMap";
import { BrowseAllSkills } from "@/components/student/BrowseAllSkills";
import { useDomainGrowth } from "@/hooks/useKnowledgeMap";

interface GrowthTrackerProps {
  studentId: string;
  /**
   * Callback when "Assign Practice" is clicked
   */
  onAssignPractice?: (domain?: string) => void;
  /**
   * Check if parent can assign (blocked if teacher present)
   */
  hasTeacher?: boolean;
  teacherName?: string;
}

/**
 * GrowthTracker - Parent's domain-level skill overview
 * 
 * Shows high-level summaries for each domain (Math, Reading, Science):
 * - Overall mastery percentage
 * - Trend arrow (up/down/stable over last month)
 * - Count of mastered/in-progress/locked skills
 * - Domain icon and color
 * 
 * Features:
 * - "View Detailed Skills" button → opens BrowseAllSkills in read-only mode
 * - "Assign Practice" button (with teacher permission check)
 * - Responsive grid layout (1-3 columns)
 * 
 * Positioned in parent dashboard
 */
export function GrowthTracker({
  studentId,
  onAssignPractice,
  hasTeacher = false,
  teacherName,
}: GrowthTrackerProps) {
  const [showBrowseAll, setShowBrowseAll] = useState(false);

  const { domains, isLoading, isError, error, refetch } = useDomainGrowth(studentId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Growth Tracker</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Target className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Loading skill data...</p>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Growth Tracker</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load skill data{error?.message ? `: ${error.message}` : "."}
            </AlertDescription>
          </Alert>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (domains.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Growth Tracker</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Target className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No skill data yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Growth Tracker</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowBrowseAll(true)}
              >
                <BookOpen className="h-3.5 w-3.5 mr-1" />
                View Details
              </Button>
              {!hasTeacher && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onAssignPractice?.()}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Assign
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {hasTeacher && (
            <div className="bg-info/10 border border-info/30 rounded-md p-2 mb-2">
              <p className="text-xs text-info-foreground">
                <Lock className="h-3 w-3 inline mr-1" />
                {teacherName || "Teacher"} is managing skill assignments
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {domains.map((domain) => (
              <DomainCard key={domain.domain} domain={domain} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* BrowseAllSkills modal (read-only) */}
      <BrowseAllSkills
        isOpen={showBrowseAll}
        onClose={() => setShowBrowseAll(false)}
        studentId={studentId}
        readOnly={true}
      />
    </>
  );
}

/**
 * Individual domain summary card
 */
function DomainCard({ domain }: { domain: DomainGrowthSummary }) {
  const masteryPct = Math.round(domain.overallMastery * 100);
  const domainInfo = getDomainInfo(domain.domain);
  const trendIcon = getTrendIcon(domain.trend);

  return (
    <div className={`p-3 rounded-md border ${domainInfo.bg} space-y-2`}>
      {/* Header: Domain icon + name */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded ${domainInfo.iconBg}`}>
            {domainInfo.icon}
          </div>
          <h3 className="text-sm font-semibold capitalize">{domain.domain}</h3>
        </div>
        {trendIcon}
      </div>

      {/* Overall mastery */}
      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Overall Mastery</span>
          <span className={`text-lg font-bold ${domainInfo.textColor}`}>
            {masteryPct}%
          </span>
        </div>
        <Progress value={masteryPct} className={`h-1.5 ${domainInfo.progressColor}`} />
      </div>

      {/* Skill counts */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="space-y-0.5">
          <div className="flex items-center justify-center gap-0.5">
            <CheckCircle2 className="h-3 w-3 text-success" />
            <span className="text-sm font-semibold">{domain.masteredCount}</span>
          </div>
          <p className="text-xs text-muted-foreground">Mastered</p>
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center justify-center gap-0.5">
            <Target className="h-3 w-3 text-warning" />
            <span className="text-sm font-semibold">{domain.inProgressCount}</span>
          </div>
          <p className="text-xs text-muted-foreground">Learning</p>
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center justify-center gap-0.5">
            <Lock className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm font-semibold">{domain.lockedCount}</span>
          </div>
          <p className="text-xs text-muted-foreground">Locked</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Get domain styling and icon
 */
function getDomainInfo(domain: string): {
  icon: JSX.Element;
  bg: string;
  iconBg: string;
  textColor: string;
  progressColor: string;
} {
  switch (domain.toLowerCase()) {
    case "math":
      return {
        icon: (
          <svg
            className="h-4 w-4 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        ),
        bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
        iconBg: "bg-blue-100 dark:bg-blue-900",
        textColor: "text-blue-600 dark:text-blue-400",
        progressColor: "[&>div]:bg-blue-500",
      };
    case "reading":
      return {
        icon: (
          <svg
            className="h-4 w-4 text-purple-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        ),
        bg: "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800",
        iconBg: "bg-purple-100 dark:bg-purple-900",
        textColor: "text-purple-600 dark:text-purple-400",
        progressColor: "[&>div]:bg-purple-500",
      };
    case "science":
      return {
        icon: (
          <svg
            className="h-4 w-4 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
            />
          </svg>
        ),
        bg: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
        iconBg: "bg-green-100 dark:bg-green-900",
        textColor: "text-green-600 dark:text-green-400",
        progressColor: "[&>div]:bg-green-500",
      };
    default:
      return {
        icon: <BookOpen className="h-4 w-4 text-muted-foreground" />,
        bg: "bg-muted/30 border-muted",
        iconBg: "bg-muted",
        textColor: "text-foreground",
        progressColor: "[&>div]:bg-primary",
      };
  }
}

/**
 * Get trend icon based on change value
 */
function getTrendIcon(trend: number): JSX.Element {
  if (trend > 0.05) {
    // >5% increase
    return (
      <Badge variant="outline" className="border-success/30 text-success">
        <TrendingUp className="h-3 w-3 mr-1" />
        +{Math.round(trend * 100)}%
      </Badge>
    );
  }
  if (trend < -0.05) {
    // >5% decrease
    return (
      <Badge variant="outline" className="border-destructive/30 text-destructive">
        <TrendingDown className="h-3 w-3 mr-1" />
        {Math.round(trend * 100)}%
      </Badge>
    );
  }
  // Stable (-5% to +5%)
  return (
    <Badge variant="outline" className="border-muted text-muted-foreground">
      <Minus className="h-3 w-3" />
    </Badge>
  );
}
