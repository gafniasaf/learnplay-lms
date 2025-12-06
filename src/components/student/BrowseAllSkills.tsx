import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X,
  Search,
  ChevronDown,
  ChevronRight,
  Lock,
  Target,
  CheckCircle2,
  BookOpen,
  Play,
  Filter,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { KnowledgeObjective, MasteryState, Topic, KOStatus } from "@/lib/types/knowledgeMap";
import { MOCK_KNOWLEDGE_OBJECTIVES, MOCK_TOPICS, MOCK_MASTERY_STATES } from "@/lib/mocks/knowledgeMockData";

interface BrowseAllSkillsProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  /**
   * Read-only mode for parent view (no practice buttons)
   */
  readOnly?: boolean;
  /**
   * Mock data mode
   */
  useMockData?: boolean;
}

type StatusFilter = "all" | "in-progress" | "mastered" | "locked";

interface SkillWithMastery {
  ko: KnowledgeObjective;
  mastery: number;
  evidenceCount: number;
  status: KOStatus;
  lastPracticed?: string;
  isLocked: boolean;
}

/**
 * BrowseAllSkills - Full-screen modal for exploring all Knowledge Objectives
 * 
 * Features:
 * - Search by skill name/description
 * - Filter by status (All/In Progress/Mastered/Locked)
 * - Filter by domain (Math/Reading/Science)
 * - Organize by topic accordion (expandable)
 * - Paginated results (20 per load, "Load More" button)
 * - Shows mastery progress, practice buttons
 * - Reusable for parent read-only view
 */
export function BrowseAllSkills({
  isOpen,
  onClose,
  studentId,
  readOnly = false,
  useMockData = true,
}: BrowseAllSkillsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [displayCount, setDisplayCount] = useState(20);

  // TODO: Replace with API call when useStudentSkills hook is ready
  const { skills, topics, domains } = useMockData
    ? getMockSkillsData(studentId)
    : { skills: [], topics: [], domains: [] };

  // Filter skills
  const filteredSkills = useMemo(() => {
    let result = skills;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.ko.name.toLowerCase().includes(query) ||
          s.ko.description?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((s) => {
        if (statusFilter === "locked") return s.isLocked;
        return s.status === statusFilter;
      });
    }

    // Domain filter
    if (domainFilter !== "all") {
      result = result.filter((s) => s.ko.domain === domainFilter);
    }

    return result;
  }, [skills, searchQuery, statusFilter, domainFilter]);

  // Group by topic
  const skillsByTopic = useMemo(() => {
    const grouped = new Map<string, SkillWithMastery[]>();
    
    filteredSkills.forEach((skill) => {
      const topicId = skill.ko.topicClusterId || "uncategorized";
      if (!grouped.has(topicId)) {
        grouped.set(topicId, []);
      }
      grouped.get(topicId)!.push(skill);
    });

    return grouped;
  }, [filteredSkills]);

  // Displayed skills (paginated)
  const displayedSkills = filteredSkills.slice(0, displayCount);
  const hasMore = displayCount < filteredSkills.length;

  const toggleTopic = (topicId: string) => {
    const newExpanded = new Set(expandedTopics);
    if (newExpanded.has(topicId)) {
      newExpanded.delete(topicId);
    } else {
      newExpanded.add(topicId);
    }
    setExpandedTopics(newExpanded);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-4xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold">
              {readOnly ? "Student Skills" : "My Skills"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {filteredSkills.length} skills
              {searchQuery || statusFilter !== "all" || domainFilter !== "all"
                ? ` (filtered from ${skills.length})`
                : ""}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Filters */}
        <div className="p-4 border-b space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filter buttons */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Status:</span>
            </div>
            {(["all", "in-progress", "mastered", "locked"] as const).map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className="h-7 text-xs"
              >
                {status === "all" ? "All" : status === "in-progress" ? "In Progress" : status === "mastered" ? "Mastered" : "Locked"}
              </Button>
            ))}

            <div className="w-px h-6 bg-border mx-1" />

            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-muted-foreground">Domain:</span>
            </div>
            <Button
              variant={domainFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setDomainFilter("all")}
              className="h-7 text-xs"
            >
              All
            </Button>
            {domains.map((domain) => (
              <Button
                key={domain}
                variant={domainFilter === domain ? "default" : "outline"}
                size="sm"
                onClick={() => setDomainFilter(domain)}
                className="h-7 text-xs capitalize"
              >
                {domain}
              </Button>
            ))}
          </div>
        </div>

        {/* Results */}
        <ScrollArea className="flex-1 p-4">
          {filteredSkills.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchQuery || statusFilter !== "all" || domainFilter !== "all"
                  ? "No skills match your filters"
                  : "No skills available"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Group by topic */}
              {Array.from(skillsByTopic.entries()).map(([topicId, topicSkills]) => {
                const topic = topics.find((t) => t.id === topicId);
                const isExpanded = expandedTopics.has(topicId);
                const displayedTopicSkills = isExpanded
                  ? topicSkills
                  : topicSkills.slice(0, 3);

                return (
                  <div key={topicId} className="space-y-2">
                    {/* Topic header */}
                    <button
                      onClick={() => toggleTopic(topicId)}
                      className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <h3 className="font-semibold text-sm">
                        {topic?.name || "Other Skills"}
                      </h3>
                      <Badge variant="secondary" className="text-xs">
                        {topicSkills.length}
                      </Badge>
                      {topic?.description && (
                        <span className="text-xs text-muted-foreground ml-2 hidden md:inline">
                          {topic.description}
                        </span>
                      )}
                    </button>

                    {/* Skills in topic */}
                    <div className="space-y-2 ml-6">
                      {displayedTopicSkills.map((skill) => (
                        <SkillRow
                          key={skill.ko.id}
                          skill={skill}
                          readOnly={readOnly}
                        />
                      ))}
                      {!isExpanded && topicSkills.length > 3 && (
                        <button
                          onClick={() => toggleTopic(topicId)}
                          className="text-xs text-primary hover:underline px-3 py-1"
                        >
                          Show {topicSkills.length - 3} more...
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Load more */}
              {hasMore && (
                <div className="text-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setDisplayCount((prev) => prev + 20)}
                  >
                    Load More
                  </Button>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Individual skill row in the browser
 */
function SkillRow({ skill, readOnly }: { skill: SkillWithMastery; readOnly: boolean }) {
  const masteryPct = Math.round(skill.mastery * 100);
  const statusIcon = getStatusIcon(skill.status, skill.isLocked);
  const statusColor = getStatusColorClass(skill.mastery, skill.isLocked);

  return (
    <div className={`p-3 rounded-md border ${statusColor.bg} space-y-2`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <div className="mt-0.5">{statusIcon}</div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium leading-tight">{skill.ko.name}</h4>
            {skill.ko.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {skill.ko.description}
              </p>
            )}
          </div>
        </div>
        <Badge variant="outline" className={`flex-shrink-0 ${statusColor.badge}`}>
          {skill.isLocked ? (
            <Lock className="h-3 w-3" />
          ) : (
            <span>{masteryPct}%</span>
          )}
        </Badge>
      </div>

      {/* Progress */}
      {!skill.isLocked && (
        <div className="space-y-1">
          <Progress value={masteryPct} className="h-1.5" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{skill.evidenceCount} attempts</span>
            {skill.lastPracticed && (
              <span>
                {Math.floor(
                  (Date.now() - new Date(skill.lastPracticed).getTime()) /
                    (1000 * 60 * 60 * 24)
                )}d ago
              </span>
            )}
          </div>
        </div>
      )}

      {/* Prerequisites indicator */}
      {skill.isLocked && skill.ko.prerequisites.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Complete {skill.ko.prerequisites.length} prerequisite
          {skill.ko.prerequisites.length > 1 ? "s" : ""} first
        </p>
      )}

      {/* Action button */}
      {!readOnly && !skill.isLocked && (
        <Button size="sm" className="w-full h-7 text-xs" variant="outline" asChild>
          <Link to={`/courses?recommendedFor=${skill.ko.id}`}>
            <Play className="h-3 w-3 mr-1.5" />
            Practice
          </Link>
        </Button>
      )}
    </div>
  );
}

/**
 * Get status icon
 */
function getStatusIcon(status: KOStatus, isLocked: boolean) {
  if (isLocked) {
    return <Lock className="h-4 w-4 text-muted-foreground" />;
  }
  if (status === "mastered") {
    return <CheckCircle2 className="h-4 w-4 text-success" />;
  }
  return <Target className="h-4 w-4 text-warning" />;
}

/**
 * Get color scheme
 */
function getStatusColorClass(mastery: number, isLocked: boolean): {
  bg: string;
  badge: string;
} {
  if (isLocked) {
    return {
      bg: "bg-muted/30 border-muted",
      badge: "border-muted text-muted-foreground",
    };
  }
  if (mastery < 0.5) {
    return {
      bg: "bg-destructive/5 border-destructive/20",
      badge: "border-destructive/30 text-destructive",
    };
  }
  if (mastery < 0.7) {
    return {
      bg: "bg-warning/5 border-warning/20",
      badge: "border-warning/30 text-warning",
    };
  }
  return {
    bg: "bg-success/5 border-success/20",
    badge: "border-success/30 text-success",
  };
}

/**
 * Mock data loader
 * TODO: Replace with API call
 */
function getMockSkillsData(studentId: string): {
  skills: SkillWithMastery[];
  topics: Topic[];
  domains: string[];
} {
  // Get all KOs
  const allKOs = MOCK_KNOWLEDGE_OBJECTIVES;

  // Get student's mastery states
  const studentMastery = MOCK_MASTERY_STATES.filter((m) => m.studentId === studentId);
  const masteryMap = new Map(studentMastery.map((m) => [m.koId, m]));

  // Check prerequisites to determine locked status
  const isLocked = (ko: KnowledgeObjective): boolean => {
    if (ko.prerequisites.length === 0) return false;
    return ko.prerequisites.some((prereqId) => {
      const prereqMastery = masteryMap.get(prereqId);
      return !prereqMastery || prereqMastery.mastery < 0.7; // Need 70% to unlock
    });
  };

  // Map to SkillWithMastery
  const skills: SkillWithMastery[] = allKOs.map((ko) => {
    const mastery = masteryMap.get(ko.id);
    const locked = isLocked(ko);

    let status: KOStatus = "locked";
    if (!locked) {
      if (!mastery || mastery.mastery < 0.7) {
        status = "in-progress";
      } else {
        status = "mastered";
      }
    }

    return {
      ko,
      mastery: mastery?.mastery || 0,
      evidenceCount: mastery?.evidenceCount || 0,
      status,
      lastPracticed: mastery?.lastUpdated,
      isLocked: locked,
    };
  });

  // Get unique domains
  const domains = Array.from(new Set(allKOs.map((ko) => ko.domain)));

  return {
    skills,
    topics: MOCK_TOPICS,
    domains,
  };
}
