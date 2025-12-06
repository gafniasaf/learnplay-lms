import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import { Target, TrendingUp, Clock, Play, BookOpen } from "lucide-react";
import { useState } from "react";
import type { SkillCard as SkillCardType } from "@/lib/types/knowledgeMap";
import { BrowseAllSkills } from "./BrowseAllSkills";

// Mock mode controlled by env var per IgniteZero rules
const ENV_USE_MOCK = (import.meta as any).env?.VITE_USE_MOCK === 'true';

interface SkillCardsProps {
  studentId: string;
  /**
   * Mock data mode - defaults to env var VITE_USE_MOCK
   */
  useMockData?: boolean;
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
export function SkillCards({ studentId, useMockData = ENV_USE_MOCK }: SkillCardsProps) {
  const [showBrowseAll, setShowBrowseAll] = useState(false);
  
  // TODO: Replace with useStudentSkills hook when created (Task 14)
  const skills = useMockData ? getMockStudentSkills(studentId) : null;
  
  if (!skills) {
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

  const { practiceNow, reviewSoon } = skills;
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
                <SkillFocusCard key={skill.ko.id} skill={skill} />
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
                <SkillFocusCard key={skill.ko.id} skill={skill} variant="review" />
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
        useMockData={useMockData}
      />
    </Card>
  );
}

/**
 * Individual skill card within the focus list
 */
function SkillFocusCard({ 
  skill, 
  variant = "practice" 
}: { 
  skill: SkillCardType; 
  variant?: "practice" | "review";
}) {
  const masteryPct = Math.round(skill.mastery * 100);
  const statusColor = getStatusColor(skill.mastery);
  const daysSince = skill.lastPracticed 
    ? Math.floor((Date.now() - new Date(skill.lastPracticed).getTime()) / (1000 * 60 * 60 * 24))
    : null;

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

      {/* Assignment indicator (if assigned by teacher/parent) */}
      {skill.hasAssignment && skill.assignmentDetails && (
        <div className="flex items-center gap-1.5 text-xs text-primary">
          <div className="h-1 w-1 rounded-full bg-primary" />
          <span className="font-medium">
            Assigned by {skill.assignmentDetails.assignedByRole === 'teacher' ? 'Teacher' : 'Parent'}
          </span>
          {skill.assignmentDetails.daysUntilDue !== undefined && skill.assignmentDetails.daysUntilDue >= 0 && (
            <span className="text-muted-foreground">
              • Due in {skill.assignmentDetails.daysUntilDue}d
            </span>
          )}
        </div>
      )}

      {/* Action button */}
      <Button 
        size="sm" 
        className="w-full h-8 text-xs"
        asChild
      >
        {skill.recommendedCourses.length > 0 ? (
          <Link to={`/play/${skill.recommendedCourses[0].courseId}/welcome?skillFocus=${skill.ko.id}`}>
            <Play className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            Practice Now
          </Link>
        ) : (
          <Link to={`/courses?recommendedFor=${skill.ko.id}`}>
            <BookOpen className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            Find Course
          </Link>
        )}
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

/**
 * Mock data generator - will be replaced with API call
 * TODO: Move to knowledgeMockData.ts helper (Task 3 extension)
 */
function getMockStudentSkills(studentId: string): { 
  practiceNow: SkillCardType[]; 
  reviewSoon: SkillCardType[]; 
} {
  // Mock: Student has 2 skills in "practice now" zone (mastery 0.4-0.6)
  // and 1 skill in "review soon" (mastered but aging)
  
  const practiceNow: SkillCardType[] = [
    {
      ko: {
        id: 'ko-math-005',
        name: 'Multiplication tables (6-10)',
        description: 'Recall multiplication facts 6×1 through 10×10',
        domain: 'math',
        topicClusterId: 'math.arithmetic',
        prerequisites: ['ko-math-004'],
        examples: [
          { problem: '7 × 8 = ?', solution: '56' },
          { problem: '9 × 6 = ?', solution: '54' },
        ],
        difficulty: 0.5,
        levelScore: 35,
        status: 'published',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        createdBy: 'llm',
      },
      mastery: 0.52,
      evidenceCount: 8,
      lastPracticed: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'in-progress',
      recommendedCourses: [
        {
          courseId: 'multiplication',
          courseTitle: 'Multiplication Mastery',
          exerciseCount: 30,
          completionPct: 45,
          relevance: 1.0,
        },
      ],
      hasAssignment: true,
      assignmentDetails: {
        id: 'assign-001',
        studentId,
        koId: 'ko-math-005',
        courseId: 'multiplication',
        assignedBy: 'teacher-1',
        assignedByRole: 'teacher',
        completionCriteria: {
          primary_kpi: 'mastery_score',
          target_mastery: 0.75,
          min_evidence: 10,
        },
        status: 'active',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ko: {
          id: 'ko-math-005',
          name: 'Multiplication tables (6-10)',
          description: 'Recall multiplication facts 6×1 through 10×10',
          domain: 'math',
          topicClusterId: 'math.arithmetic',
          prerequisites: ['ko-math-004'],
          examples: [],
          difficulty: 0.5,
          levelScore: 35,
          status: 'published',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
        courseName: 'Multiplication Mastery',
        currentMastery: 0.52,
        progressCurrent: 8,
        progressTarget: 10,
        progressPercentage: 52,
        daysUntilDue: 7,
        assignedByName: 'Mrs. Johnson',
      },
    },
    {
      ko: {
        id: 'ko-math-012',
        name: 'Equivalent fractions',
        description: 'Identify and create equivalent fractions',
        domain: 'math',
        topicClusterId: 'math.fractions',
        prerequisites: ['ko-math-011'],
        examples: [
          { problem: '1/2 = ?/8', solution: '4/8' },
          { problem: 'Simplify 6/9', solution: '2/3' },
        ],
        difficulty: 0.5,
        levelScore: 35,
        status: 'published',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        createdBy: 'llm',
      },
      mastery: 0.48,
      evidenceCount: 6,
      lastPracticed: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'in-progress',
      recommendedCourses: [
        {
          courseId: 'fractions-grade5',
          courseTitle: 'Fractions & Decimals',
          exerciseCount: 22,
          completionPct: 28,
          relevance: 1.0,
        },
      ],
      hasAssignment: false,
    },
  ];

  const reviewSoon: SkillCardType[] = [
    {
      ko: {
        id: 'ko-math-004',
        name: 'Multiplication tables (1-5)',
        description: 'Recall multiplication facts 1×1 through 5×10',
        domain: 'math',
        topicClusterId: 'math.arithmetic',
        prerequisites: ['ko-math-001'],
        examples: [
          { problem: '3 × 4 = ?', solution: '12' },
          { problem: '5 × 7 = ?', solution: '35' },
        ],
        difficulty: 0.35,
        levelScore: 30,
        status: 'published',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        createdBy: 'llm',
      },
      mastery: 0.78,
      evidenceCount: 15,
      lastPracticed: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'mastered',
      recommendedCourses: [
        {
          courseId: 'multiplication',
          courseTitle: 'Multiplication Mastery',
          exerciseCount: 25,
          completionPct: 92,
          relevance: 1.0,
        },
      ],
      hasAssignment: false,
    },
  ];

  return { practiceNow, reviewSoon };
}
