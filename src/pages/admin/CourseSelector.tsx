import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMCP } from '@/hooks/useMCP';
import type { OrgConfig } from '@/lib/api/orgConfig';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Search, Edit, BookOpen, X, Filter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { CourseCatalogItem } from '@/lib/types/courseCatalog';

const CourseSelector = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const mcp = useMCP();
  
  const [courses, setCourses] = useState<any[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [orgConfig, setOrgConfig] = useState<OrgConfig | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [useMetadata, setUseMetadata] = useState(false); // Toggle between metadata and catalog.json
  const [filterLogic, setFilterLogic] = useState<'OR' | 'AND'>('OR');
  const [orgConfigAuthRequired, setOrgConfigAuthRequired] = useState(false);

  // Admin guard
  const devOverrideRole = typeof window !== 'undefined' ? localStorage.getItem('role') : null;
  const isAdmin = role === 'admin' || devOverrideRole === 'admin' || 
                  user?.app_metadata?.role === 'admin' || user?.user_metadata?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) {
      navigate('/admin');
      return;
    }

    loadOrgConfig();
    loadCourses();
  }, [isAdmin, navigate]);

  const loadOrgConfig = useCallback(async () => {
    try {
      const config = await mcp.getOrgConfig() as unknown as OrgConfig;
      setOrgConfig(config);
      setOrgConfigAuthRequired(false);
    } catch (error: any) {
      if (typeof error?.message === 'string' && error.message.includes('NOT_AUTHENTICATED')) {
        setOrgConfigAuthRequired(true);
      } else {
        console.error('[CourseSelector] Failed to load org config:', error);
      }
      // Continue without tag filtering (catalog view still works)
    }
  }, []);

  const loadCourses = useCallback(async () => {
    try {
      setLoading(true);

      if (useMetadata) {
        // Query course_metadata (new multi-tenant way)
        const result = await mcp.getCoursesByTags(selectedTagIds.length > 0 ? selectedTagIds : []);

        setCourses(result.courses);
        setFilteredCourses(result.courses);
      } else {
        // Fallback to catalog.json (legacy)
        const catalog = await mcp.getCourseCatalog() as { courses: CourseCatalogItem[] };
        console.log('[CourseSelector] Loaded catalog:', catalog.courses.map(c => c.id));
        setCourses(catalog.courses);
        setFilteredCourses(catalog.courses);
      }
    } catch (error: any) {
      console.error('[CourseSelector] Failed to load courses:', error);
      
      // If metadata query fails, fall back to catalog
      if (useMetadata) {
        toast({
          title: 'Falling back to catalog',
          description: 'Course metadata not available yet. Using catalog.json.',
        });
        setUseMetadata(false);
        // Will trigger re-load via useEffect
      } else {
        setCourses([]);
        setFilteredCourses([]);
      }
    } finally {
      setLoading(false);
    }
  }, [useMetadata, selectedTagIds, filterLogic, toast]);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/admin');
      return;
    }

    loadOrgConfig();
    loadCourses();
  }, [isAdmin, navigate, loadOrgConfig, loadCourses]);

  // Reload when tag filters change
  useEffect(() => {
    if (useMetadata) {
      loadCourses();
    }
  }, [selectedTagIds, filterLogic, useMetadata, loadCourses]);

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

  const handleToggleTag = (tagId: string) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleClearFilters = () => {
    setSelectedTagIds([]);
  };

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
              Choose a course from the catalog to open in the Course Editor
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Data Source Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant={useMetadata ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUseMetadata(!useMetadata)}
                >
                  {useMetadata ? 'Using Metadata (New)' : 'Using Catalog (Legacy)'}
                </Button>
                {useMetadata && orgConfig && (
                  <Badge variant="outline">{orgConfig.organization.name}</Badge>
                )}
              </div>
              
              {useMetadata && selectedTagIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Filter Logic:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilterLogic(filterLogic === 'OR' ? 'AND' : 'OR')}
                  >
                    {filterLogic}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearFilters}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear Filters
                  </Button>
                </div>
              )}
            </div>

            {useMetadata && orgConfigAuthRequired && (
              <div className="mt-3 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm flex items-center justify-between">
                <span>Sign in to enable tag filtering for your organization.</span>
                <Button variant="outline" size="sm" onClick={() => navigate('/auth')}>Sign in</Button>
              </div>
            )}

            {/* Tag Filters (only when using metadata) */}
            {useMetadata && orgConfig && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Filter by Tags:</span>
                </div>
                {orgConfig.tagTypes
                  .filter(tt => tt.isEnabled && tt.tags.length > 0)
                  .map(tagType => (
                    <div key={tagType.key} className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">
                        {tagType.label}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {tagType.tags.map(tag => (
                          <Badge
                            key={tag.id}
                            variant={selectedTagIds.includes(tag.id) ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => handleToggleTag(tag.id)}
                          >
                            {tag.value}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
              <p className="text-blue-900">
                <strong>Note:</strong> The Course Editor requires the full course JSON to exist in Supabase storage. 
                If a course shows a "not found" error, it means only the catalog entry exists but not the full course file.
                Try courses that were generated via AI Author or imported via upload scripts.
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
                        
                        {/* Show tags when using metadata */}
                        {useMetadata && course.tags && Object.keys(course.tags).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {Object.entries(course.tags).map(([type, values]: [string, any]) => (
                              Array.isArray(values) && values.map((slug: string, idx: number) => (
                                <Badge key={`${type}-${idx}`} variant="secondary" className="text-xs">
                                  {slug}
                                </Badge>
                              ))
                            ))}
                          </div>
                        )}
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

