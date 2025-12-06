import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Users,
  AlertTriangle,
  Target,
  TrendingUp,
  Plus,
} from "lucide-react";
import type { ClassKOSummary } from "@/lib/types/knowledgeMap";

interface TeacherKOTableProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  /**
   * Callback when a row is clicked or "Assign" is clicked
   */
  onAssignKO?: (koId: string) => void;
  /**
   * Mock data mode
   */
  useMockData?: boolean;
}

type SortField = "name" | "struggling" | "avgMastery" | "students";
type SortDirection = "asc" | "desc";

/**
 * TeacherKOTable - Full-screen modal with comprehensive KO table
 * 
 * Features:
 * - Sortable columns (KO name, struggling count, avg mastery, student count)
 * - Search bar (filters by KO name)
 * - Color-coded status rows (red/yellow/green)
 * - Load more pagination (20 per page)
 * - Click row or "Assign" button → opens AssignmentModal
 * 
 * Triggered by "View All" button in ClassFocusWidget
 */
export function TeacherKOTable({
  isOpen,
  onClose,
  classId,
  onAssignKO,
  useMockData = true,
}: TeacherKOTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("struggling");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [displayCount, setDisplayCount] = useState(20);

  // TODO: Replace with API call when service layer is ready
  const allKOs = useMockData ? getMockAllClassKOs(classId) : [];

  // Filter and sort
  const filteredAndSorted = useMemo(() => {
    let result = allKOs;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((ko) => ko.koName.toLowerCase().includes(query));
    }

    // Sort
    result = [...result].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      switch (sortField) {
        case "name":
          aVal = a.koName.toLowerCase();
          bVal = b.koName.toLowerCase();
          break;
        case "struggling":
          aVal = a.strugglingCount;
          bVal = b.strugglingCount;
          break;
        case "avgMastery":
          aVal = a.avgMastery;
          bVal = b.avgMastery;
          break;
        case "students":
          aVal = a.totalStudents;
          bVal = b.totalStudents;
          break;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [allKOs, searchQuery, sortField, sortDirection]);

  const displayedKOs = filteredAndSorted.slice(0, displayCount);
  const hasMore = displayCount < filteredAndSorted.length;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc"); // Default to desc for new field
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold">Class Skills Overview</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {filteredAndSorted.length} skill{filteredAndSorted.length !== 1 ? "s" : ""}
              {searchQuery && ` (filtered from ${allKOs.length})`}
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

        {/* Search bar */}
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Table */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            <div className="rounded-md border">
              {/* Table header */}
              <div className="grid grid-cols-12 gap-4 p-3 bg-muted/50 border-b font-medium text-xs">
                <div className="col-span-5">
                  <SortButton
                    label="Skill Name"
                    active={sortField === "name"}
                    direction={sortDirection}
                    onClick={() => handleSort("name")}
                  />
                </div>
                <div className="col-span-2 text-center">
                  <SortButton
                    label="Struggling"
                    active={sortField === "struggling"}
                    direction={sortDirection}
                    onClick={() => handleSort("struggling")}
                  />
                </div>
                <div className="col-span-2 text-center">
                  <SortButton
                    label="Avg Mastery"
                    active={sortField === "avgMastery"}
                    direction={sortDirection}
                    onClick={() => handleSort("avgMastery")}
                  />
                </div>
                <div className="col-span-2 text-center">
                  <SortButton
                    label="Students"
                    active={sortField === "students"}
                    direction={sortDirection}
                    onClick={() => handleSort("students")}
                  />
                </div>
                <div className="col-span-1 text-center">Action</div>
              </div>

              {/* Table rows */}
              {displayedKOs.length === 0 ? (
                <div className="text-center py-12">
                  <Target className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {searchQuery ? "No skills match your search" : "No skills data available"}
                  </p>
                </div>
              ) : (
                displayedKOs.map((ko) => (
                  <KOTableRow
                    key={ko.koId}
                    ko={ko}
                    onClick={() => onAssignKO?.(ko.koId)}
                  />
                ))
              )}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="text-center mt-4">
                <Button
                  variant="outline"
                  onClick={() => setDisplayCount((prev) => prev + 20)}
                >
                  Load More ({filteredAndSorted.length - displayCount} remaining)
                </Button>
              </div>
            )}
          </div>
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
 * Sort button for column headers
 */
function SortButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      <span>{label}</span>
      {active ? (
        direction === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  );
}

/**
 * Individual table row
 */
function KOTableRow({ ko, onClick }: { ko: ClassKOSummary; onClick: () => void }) {
  const avgMasteryPct = Math.round(ko.avgMastery * 100);
  const statusInfo = getStatusInfo(ko.status);
  const strugglingPct =
    ko.totalStudents > 0 ? Math.round((ko.strugglingCount / ko.totalStudents) * 100) : 0;

  return (
    <div
      className={`grid grid-cols-12 gap-4 p-3 border-b items-center hover:bg-muted/30 transition-colors ${statusInfo.bg}`}
    >
      {/* Skill name */}
      <div className="col-span-5 flex items-center gap-2">
        {statusInfo.icon}
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight truncate">{ko.koName}</p>
          {ko.topicClusterId && (
            <p className="text-xs text-muted-foreground capitalize">
              {ko.topicClusterId.split(".")[1] || ko.topicClusterId}
            </p>
          )}
        </div>
      </div>

      {/* Struggling count */}
      <div className="col-span-2 text-center">
        {ko.strugglingCount > 0 ? (
          <div className="inline-flex items-center gap-1.5">
            <Badge variant="destructive" className="text-xs">
              {ko.strugglingCount}
            </Badge>
            <span className="text-xs text-muted-foreground">({strugglingPct}%)</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      {/* Avg mastery */}
      <div className="col-span-2 text-center">
        <Badge variant="outline" className={statusInfo.badge}>
          {avgMasteryPct}%
        </Badge>
      </div>

      {/* Student count */}
      <div className="col-span-2 text-center">
        <div className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {ko.totalStudents}
        </div>
      </div>

      {/* Action */}
      <div className="col-span-1 text-center">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          title="Assign practice"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Get status styling
 */
function getStatusInfo(status: "urgent" | "opportunity" | "strong"): {
  icon: JSX.Element;
  bg: string;
  badge: string;
} {
  switch (status) {
    case "urgent":
      return {
        icon: <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />,
        bg: "bg-destructive/5",
        badge: "border-destructive/30 text-destructive",
      };
    case "opportunity":
      return {
        icon: <Target className="h-4 w-4 text-warning flex-shrink-0" />,
        bg: "bg-warning/5",
        badge: "border-warning/30 text-warning",
      };
    case "strong":
      return {
        icon: <TrendingUp className="h-4 w-4 text-success flex-shrink-0" />,
        bg: "bg-success/5",
        badge: "border-success/30 text-success",
      };
  }
}

/**
 * Mock data generator - all class KOs
 * TODO: Replace with API call
 */
function getMockAllClassKOs(classId: string): ClassKOSummary[] {
  const totalStudents = 2;

  // Return all KOs the class has touched, sorted by urgency
  return [
    // Urgent
    {
      classId,
      className: "Math 4A",
      koId: "ko-math-002",
      koName: "Two-digit addition with regrouping",
      domain: "math",
      topicClusterId: "math.arithmetic",
      totalStudents,
      strugglingCount: 2,
      avgMastery: 0.35,
      lastPracticed: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: "urgent",
    },
    // Opportunity
    {
      classId,
      className: "Math 4A",
      koId: "ko-math-005",
      koName: "Multiplication tables (6-10)",
      domain: "math",
      topicClusterId: "math.arithmetic",
      totalStudents,
      strugglingCount: 1,
      avgMastery: 0.52,
      lastPracticed: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      status: "opportunity",
    },
    {
      classId,
      className: "Math 4A",
      koId: "ko-math-011",
      koName: "Understanding fractions",
      domain: "math",
      topicClusterId: "math.fractions",
      totalStudents,
      strugglingCount: 1,
      avgMastery: 0.58,
      lastPracticed: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      status: "opportunity",
    },
    {
      classId,
      className: "Math 4A",
      koId: "ko-math-012",
      koName: "Equivalent fractions",
      domain: "math",
      topicClusterId: "math.fractions",
      totalStudents,
      strugglingCount: 1,
      avgMastery: 0.62,
      lastPracticed: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      status: "opportunity",
    },
    // Strong
    {
      classId,
      className: "Math 4A",
      koId: "ko-math-004",
      koName: "Multiplication tables (1-5)",
      domain: "math",
      topicClusterId: "math.arithmetic",
      totalStudents,
      strugglingCount: 0,
      avgMastery: 0.78,
      lastPracticed: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      status: "strong",
    },
    {
      classId,
      className: "Math 4A",
      koId: "ko-math-001",
      koName: "Single-digit addition",
      domain: "math",
      topicClusterId: "math.arithmetic",
      totalStudents,
      strugglingCount: 0,
      avgMastery: 0.85,
      lastPracticed: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: "strong",
    },
    {
      classId,
      className: "Math 4A",
      koId: "ko-math-003",
      koName: "Single-digit subtraction",
      domain: "math",
      topicClusterId: "math.arithmetic",
      totalStudents,
      strugglingCount: 0,
      avgMastery: 0.82,
      lastPracticed: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      status: "strong",
    },
  ];
}
