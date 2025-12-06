import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type TopicRow = {
  date: string; // ISO string
  subject: string;
  topic: string;
  minutes: number;
  items: number;
  accuracyPct: number;
  status: 'New' | 'Practicing' | 'Mastered';
};

interface TopicsHandledProps {
  day: TopicRow[];
  week: TopicRow[];
  month: TopicRow[];
}

const ITEMS_PER_PAGE = 10;

export const TopicsHandled = ({ day, week, month }: TopicsHandledProps) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'day' | 'week' | 'month'>('week');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<TopicRow['status'][]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  // Get data for active tab
  const activeData = activeTab === 'day' ? day : activeTab === 'week' ? week : month;

  // Get unique subjects for filters
  const allSubjects = useMemo(() => {
    const subjects = new Set<string>();
    [day, week, month].flat().forEach(row => subjects.add(row.subject));
    return Array.from(subjects).sort();
  }, [day, week, month]);

  const allStatuses: TopicRow['status'][] = ['New', 'Practicing', 'Mastered'];

  // Filter and search data
  const filteredData = useMemo(() => {
    let result = activeData;

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(row => 
        row.topic.toLowerCase().includes(query) ||
        row.subject.toLowerCase().includes(query)
      );
    }

    // Apply subject filters
    if (selectedSubjects.length > 0) {
      result = result.filter(row => selectedSubjects.includes(row.subject));
    }

    // Apply status filters
    if (selectedStatuses.length > 0) {
      result = result.filter(row => selectedStatuses.includes(row.status));
    }

    return result;
  }, [activeData, searchQuery, selectedSubjects, selectedStatuses]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset pagination when filters change
  const handleTabChange = (tab: 'day' | 'week' | 'month') => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const toggleSubject = (subject: string) => {
    setSelectedSubjects(prev =>
      prev.includes(subject)
        ? prev.filter(s => s !== subject)
        : [...prev, subject]
    );
    setCurrentPage(1);
  };

  const toggleStatus = (status: TopicRow['status']) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedSubjects([]);
    setSelectedStatuses([]);
    setCurrentPage(1);
  };

  const handleViewInTimeline = (row: TopicRow) => {
    // Navigate to timeline with query params for filtering
    const params = new URLSearchParams({
      subject: row.subject,
      date: row.date,
    });
    navigate(`/parent/timeline?${params.toString()}`);
  };

  const getStatusBadgeVariant = (status: TopicRow['status']) => {
    switch (status) {
      case 'New':
        return 'secondary';
      case 'Practicing':
        return 'outline';
      case 'Mastered':
        return 'default';
    }
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 90) return 'text-success';
    if (accuracy >= 80) return 'text-warning';
    return 'text-destructive';
  };

  const formatDateTime = (dateStr: string, showTime: boolean = true) => {
    try {
      const date = parseISO(dateStr);
      return showTime ? format(date, 'MMM d, h:mm a') : format(date, 'MMM d');
    } catch {
      return dateStr;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Topics Handled</CardTitle>
        <p className="text-sm text-muted-foreground">Detailed breakdown of learning activities</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="day">Today ({day.length})</TabsTrigger>
            <TabsTrigger value="week">This Week ({week.length})</TabsTrigger>
            <TabsTrigger value="month">This Month ({month.length})</TabsTrigger>
          </TabsList>

          {/* Search and Filters */}
          <div className="space-y-3 pt-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search topics or subjects..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 pr-9"
                aria-label="Search topics"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => handleSearchChange('')}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Subject Filters */}
            {allSubjects.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm text-muted-foreground mr-2">Filters:</span>
                
                {/* Subject Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Subjects
                      {selectedSubjects.length > 0 && (
                        <Badge variant="secondary" className="ml-2 px-1.5 py-0.5 text-xs">
                          {selectedSubjects.length}
                        </Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56 bg-card">
                    <DropdownMenuLabel>Filter by subject</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {allSubjects.map(subject => (
                      <DropdownMenuCheckboxItem
                        key={subject}
                        checked={selectedSubjects.includes(subject)}
                        onCheckedChange={() => toggleSubject(subject)}
                      >
                        {subject}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Status Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Status
                      {selectedStatuses.length > 0 && (
                        <Badge variant="secondary" className="ml-2 px-1.5 py-0.5 text-xs">
                          {selectedStatuses.length}
                        </Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56 bg-card">
                    <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {allStatuses.map(status => (
                      <DropdownMenuCheckboxItem
                        key={status}
                        checked={selectedStatuses.includes(status)}
                        onCheckedChange={() => toggleStatus(status)}
                      >
                        {status}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {(searchQuery || selectedSubjects.length > 0 || selectedStatuses.length > 0) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-8 text-xs"
                  >
                    Clear all
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Table Content */}
          <TabsContent value="day" className="mt-4 space-y-4">
            {renderTable(paginatedData, true)}
          </TabsContent>
          <TabsContent value="week" className="mt-4 space-y-4">
            {renderTable(paginatedData, false)}
          </TabsContent>
          <TabsContent value="month" className="mt-4 space-y-4">
            {renderTable(paginatedData, false)}
          </TabsContent>
        </Tabs>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)} of {filteredData.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  function renderTable(data: TopicRow[], showTime: boolean) {
    if (data.length === 0) {
      return (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <p className="text-muted-foreground">
            {searchQuery || selectedSubjects.length > 0
              ? "No topics match your filters"
              : "No topics yet"}
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto -mx-6 px-6 max-h-[600px] overflow-y-auto">
        <table className="w-full border-collapse" role="table">
          <thead className="sticky top-0 bg-card z-10 border-b shadow-sm">
            <tr>
              <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground bg-card">
                {showTime ? 'Date & Time' : 'Date'}
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground bg-card">
                Subject
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground bg-card">
                Topic
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground bg-card">
                Minutes
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground bg-card">
                Items
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground bg-card">
                Accuracy
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground bg-card">
                Status
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground bg-card">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr
                key={idx}
                className="border-b hover:bg-accent/5 transition-colors focus-within:bg-accent/10"
                tabIndex={0}
                role="row"
                aria-label={`${row.topic} in ${row.subject}, ${row.accuracyPct}% accuracy`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleViewInTimeline(row);
                  }
                }}
              >
                <td className="py-3 px-4 text-sm">
                  {formatDateTime(row.date, showTime)}
                </td>
                <td className="py-3 px-4">
                  <Badge variant="outline" className="text-xs">
                    {row.subject}
                  </Badge>
                </td>
                <td className="py-3 px-4 font-medium">
                  {row.topic}
                </td>
                <td className="py-3 px-4 text-right text-sm text-muted-foreground">
                  {row.minutes}
                </td>
                <td className="py-3 px-4 text-right text-sm text-muted-foreground">
                  {row.items}
                </td>
                <td className={`py-3 px-4 text-right text-sm font-semibold ${getAccuracyColor(row.accuracyPct)}`}>
                  {row.accuracyPct}%
                </td>
                <td className="py-3 px-4">
                  <Badge variant={getStatusBadgeVariant(row.status)}>
                    {row.status}
                  </Badge>
                </td>
                <td className="py-3 px-4 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewInTimeline(row);
                    }}
                    className="h-8 gap-1"
                    aria-label={`View ${row.topic} in timeline`}
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span className="hidden sm:inline">Timeline</span>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
};
