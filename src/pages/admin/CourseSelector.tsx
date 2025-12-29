import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useMCP } from '@/hooks/useMCP';
import { useAuth } from '@/hooks/useAuth';
import { 
  Loader2, 
  Search, 
  Edit, 
  BookOpen, 
  GraduationCap,
  Filter,
  SortAsc,
  SortDesc,
  X,
  Sparkles
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { CourseCatalogItem } from '@/lib/types/courseCatalog';
import { isDevAgentMode } from '@/lib/api/common';
import { cn } from '@/lib/utils';

// Category types for filtering
type CategoryFilter = 'all' | 'expertcollege' | 'standard';
type SortField = 'title' | 'subject' | 'updated' | 'items';
type SortDirection = 'asc' | 'desc';

export interface CourseSelectorProps {
  /** Base path for the editor route. Example: `/admin/editor` */
  editorBasePath?: string;
  title?: string;
  description?: string;
  editLabel?: string;
}

// Helper to detect Expertcollege courses
function isExpertcollegeCourse(course: CourseCatalogItem): boolean {
  const title = (course.title || '').toLowerCase();
  const subject = (course.subject || '').toLowerCase();
  const id = (course.id || '').toLowerCase();
  
  return (
    title.includes('expertcollege') ||
    subject.includes('expertcollege') ||
    id.includes('expertcollege') ||
    id.includes('e2e') ||
    title.includes('e2e ')
  );
}

// Get unique subjects from courses
function getUniqueSubjects(courses: CourseCatalogItem[]): string[] {
  const subjects = new Set<string>();
  courses.forEach(course => {
    if (course.subject) {
      subjects.add(course.subject);
    }
  });
  return Array.from(subjects).sort();
}

const CourseSelector = ({
  editorBasePath = '/admin/editor',
  title = 'Select Course to Edit',
  description = 'Choose a course to open in the Course Editor',
  editLabel = 'Edit',
}: CourseSelectorProps) => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const mcp = useMCP();
  
  const [courses, setCourses] = useState<CourseCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('title');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Admin guard
  const devOverrideRole = typeof window !== 'undefined' ? localStorage.getItem('role') : null;
  const devAgent = isDevAgentMode();
  const isAdmin =
    devAgent ||
    role === 'admin' ||
    devOverrideRole === 'admin' ||
    user?.app_metadata?.role === 'admin' ||
    user?.user_metadata?.role === 'admin';

  const loadCourses = useCallback(async () => {
    try {
      setLoading(true);
      const catalog = await mcp.getCourseCatalog() as { courses: CourseCatalogItem[] };
      console.log('[CourseSelector] Loaded courses:', catalog.courses.map(c => c.id));
      setCourses(catalog.courses);
    } catch (error: unknown) {
      console.error('[CourseSelector] Failed to load courses:', error);
      setCourses([]);
      toast({
        title: 'Failed to load courses',
        description: error instanceof Error ? error.message : 'Unable to fetch course list',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [mcp, toast]);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/admin');
      return;
    }
    loadCourses();
  }, [isAdmin, navigate, loadCourses]);

  // Get unique subjects for filter dropdown
  const uniqueSubjects = useMemo(() => getUniqueSubjects(courses), [courses]);

  // Count courses by category
  const categoryCounts = useMemo(() => {
    const expertcollege = courses.filter(isExpertcollegeCourse).length;
    return {
      all: courses.length,
      expertcollege,
      standard: courses.length - expertcollege,
    };
  }, [courses]);

  // Apply filters and sorting
  const filteredCourses = useMemo(() => {
    let result = [...courses];

    // Category filter
    if (categoryFilter === 'expertcollege') {
      result = result.filter(isExpertcollegeCourse);
    } else if (categoryFilter === 'standard') {
      result = result.filter(c => !isExpertcollegeCourse(c));
    }

    // Subject filter
    if (subjectFilter !== 'all') {
      result = result.filter(c => c.subject === subjectFilter);
    }

    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        course =>
          (course.title || '').toLowerCase().includes(query) ||
          (course.subject || '').toLowerCase().includes(query) ||
          (course.id || '').toLowerCase().includes(query)
      );
    }

    // Sorting
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'title':
          comparison = (a.title || '').localeCompare(b.title || '');
          break;
        case 'subject':
          comparison = (a.subject || '').localeCompare(b.subject || '');
          break;
        case 'updated':
          // Note: CourseCatalogItem doesn't have updated_at, sort by title as fallback
          comparison = (a.title || '').localeCompare(b.title || '');
          break;
        case 'items':
          comparison = (b.itemCount || 0) - (a.itemCount || 0);
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [courses, categoryFilter, subjectFilter, searchQuery, sortField, sortDirection]);

  // Check if any filters are active
  const hasActiveFilters = categoryFilter !== 'all' || subjectFilter !== 'all' || searchQuery.trim();

  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setSubjectFilter('all');
  };

  const handleSelectCourse = (courseId: string) => {
    const base = editorBasePath.replace(/\/$/, '');
    navigate(`${base}/${courseId}`);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-lg">Loading courses...</span>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Edit className="h-6 w-6" />
              {title}
            </CardTitle>
            <CardDescription>
              {description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
              <p className="text-blue-900">
                <strong>Note:</strong> The Course Editor requires the full course JSON to exist in Supabase storage. 
                Courses must be stored at <code>courses/&lt;id&gt;/course.json</code> with a matching <code>course_metadata</code> row.
                If you only have legacy files at <code>courses/&lt;id&gt;.json</code>, migrate them before editing.
              </p>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={categoryFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCategoryFilter('all')}
                className="gap-2"
              >
                <BookOpen className="h-4 w-4" />
                All Courses
                <Badge variant="secondary" className="ml-1">{categoryCounts.all}</Badge>
              </Button>
              <Button
                variant={categoryFilter === 'expertcollege' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCategoryFilter('expertcollege')}
                className={cn(
                  "gap-2",
                  categoryFilter === 'expertcollege' 
                    ? "bg-amber-600 hover:bg-amber-700" 
                    : "border-amber-400 text-amber-700 hover:bg-amber-50"
                )}
              >
                <Sparkles className="h-4 w-4" />
                Expertcollege
                <Badge variant="secondary" className="ml-1 bg-amber-100 text-amber-800">{categoryCounts.expertcollege}</Badge>
              </Button>
              <Button
                variant={categoryFilter === 'standard' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCategoryFilter('standard')}
                className="gap-2"
              >
                <GraduationCap className="h-4 w-4" />
                Standard Courses
                <Badge variant="secondary" className="ml-1">{categoryCounts.standard}</Badge>
              </Button>
            </div>

            {/* Search and Filters Row */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title, subject, or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Subject Filter */}
              <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {uniqueSubjects.map(subject => (
                    <SelectItem key={subject} value={subject}>
                      {subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Sort */}
              <Select 
                value={`${sortField}-${sortDirection}`} 
                onValueChange={(value) => {
                  const [field, dir] = value.split('-') as [SortField, SortDirection];
                  setSortField(field);
                  setSortDirection(dir);
                }}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  {sortDirection === 'asc' ? (
                    <SortAsc className="h-4 w-4 mr-2" />
                  ) : (
                    <SortDesc className="h-4 w-4 mr-2" />
                  )}
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="title-asc">Title (A-Z)</SelectItem>
                  <SelectItem value="title-desc">Title (Z-A)</SelectItem>
                  <SelectItem value="subject-asc">Subject (A-Z)</SelectItem>
                  <SelectItem value="subject-desc">Subject (Z-A)</SelectItem>
                  <SelectItem value="updated-desc">Recently Updated</SelectItem>
                  <SelectItem value="updated-asc">Oldest First</SelectItem>
                  <SelectItem value="items-desc">Most Items</SelectItem>
                  <SelectItem value="items-asc">Fewest Items</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Active Filters & Clear */}
            {hasActiveFilters && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Showing {filteredCourses.length} of {courses.length} courses</span>
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2">
                  <X className="h-3 w-3 mr-1" />
                  Clear filters
                </Button>
              </div>
            )}

            {/* Course List */}
            <div className="space-y-2">
              {filteredCourses.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {hasActiveFilters ? (
                    <div className="space-y-2">
                      <p>No courses found matching your filters</p>
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    </div>
                  ) : (
                    'No courses available'
                  )}
                </div>
              ) : (
                filteredCourses.map((course) => {
                  const isEC = isExpertcollegeCourse(course);
                  
                  return (
                    <div
                      key={course.id}
                      className={cn(
                        "flex items-center justify-between p-4 border-2 rounded-lg transition-all cursor-pointer",
                        isEC
                          ? "border-amber-400 bg-amber-50/30 hover:border-amber-500 hover:bg-amber-50"
                          : "border-gray-200 hover:border-primary hover:bg-primary/5"
                      )}
                      onClick={() => handleSelectCourse(course.id)}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className={cn(
                          "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0",
                          isEC ? "bg-amber-100" : "bg-primary/10"
                        )}>
                          {isEC ? (
                            <Sparkles className="h-6 w-6 text-amber-600" />
                          ) : (
                            <BookOpen className="h-6 w-6 text-primary" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold truncate">{course.title}</h3>
                            {isEC && (
                              <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs">
                                Expertcollege
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground mt-1">
                            {course.subject && <span>{course.subject}</span>}
                            {course.gradeBand && (
                              <>
                                <span className="hidden sm:inline">•</span>
                                <span>{course.gradeBand}</span>
                              </>
                            )}
                            {course.itemCount !== undefined && (
                              <>
                                <span className="hidden sm:inline">•</span>
                                <span>{course.itemCount} items</span>
                              </>
                            )}
                            <span className="hidden sm:inline">•</span>
                            <span className="text-xs font-mono">v{course.contentVersion || 1}</span>
                          </div>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className={cn(
                          isEC && "border-amber-400 text-amber-700 hover:bg-amber-100"
                        )}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        {editLabel}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Results Summary */}
            {filteredCourses.length > 0 && (
              <div className="text-center text-sm text-muted-foreground pt-4 border-t">
                Showing {filteredCourses.length} course{filteredCourses.length !== 1 ? 's' : ''}
                {hasActiveFilters && ` (filtered from ${courses.length} total)`}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
};

export default CourseSelector;
