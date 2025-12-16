import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMCP } from '@/hooks/useMCP';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Search, Edit, BookOpen } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { CourseCatalogItem } from '@/lib/types/courseCatalog';
import { isDevAgentMode } from '@/lib/api/common';

const CourseSelector = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const mcp = useMCP();
  
  const [courses, setCourses] = useState<any[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

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
      setFilteredCourses(catalog.courses);
    } catch (error: any) {
      console.error('[CourseSelector] Failed to load courses:', error);
      setCourses([]);
      setFilteredCourses([]);
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

  // Client-side search (works for both metadata and catalog)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredCourses(courses);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = courses.filter(
      course =>
        (course.title || '').toLowerCase().includes(query) ||
        (course.subject || '').toLowerCase().includes(query) ||
        (course.id || '').toLowerCase().includes(query)
    );
    setFilteredCourses(filtered);
  }, [searchQuery, courses]);

  const handleSelectCourse = (courseId: string) => {
    navigate(`/admin/editor/${courseId}`);
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
              Select Course to Edit
            </CardTitle>
            <CardDescription>
              Choose a course to open in the Course Editor
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

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search courses by title, subject, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Course List */}
            <div className="space-y-2">
              {filteredCourses.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {searchQuery ? 'No courses found matching your search' : 'No courses available'}
                </div>
              ) : (
                filteredCourses.map((course) => (
                  <div
                    key={course.id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-primary hover:bg-primary/5 transition-all cursor-pointer"
                    onClick={() => handleSelectCourse(course.id)}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <BookOpen className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">{course.title}</h3>
                        <div className="flex gap-3 text-sm text-muted-foreground mt-1">
                          {course.subject && <span>{course.subject}</span>}
                          {course.gradeBand && (
                            <>
                              <span>•</span>
                              <span>{course.gradeBand}</span>
                            </>
                          )}
                          {course.itemCount && (
                            <>
                              <span>•</span>
                              <span>{course.itemCount} items</span>
                            </>
                          )}
                          <span>•</span>
                          <span className="text-xs">v{course.content_version || course.contentVersion || 1}</span>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
};

export default CourseSelector;

