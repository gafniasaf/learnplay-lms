import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { BookOpen, Search, RefreshCw, Target, X } from "lucide-react";
import { CourseCard } from "@/components/courses/CourseCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getCourseCatalog, searchCourses } from "@/lib/api";
import type { CourseCatalogItem } from "@/lib/types/courseCatalog";
import { useCatalogVersionListener } from "@/hooks/useCatalogVersionListener";
import { supabase } from "@/integrations/supabase/client";
import { isLiveMode } from "@/lib/env";
import { toast } from "sonner";
import { getRecommendedCourses } from "@/lib/api/knowledgeMap";
import { MOCK_KNOWLEDGE_OBJECTIVES } from "@/lib/mocks/knowledgeMockData";

const Courses = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const recommendedFor = searchParams.get('recommendedFor');
  const studentId = searchParams.get('studentId') || 'student-1';
  
  const [courses, setCourses] = useState<CourseCatalogItem[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<CourseCatalogItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [koName, setKoName] = useState<string | null>(null);

  // Listen for catalog version changes and trigger re-load
  useCatalogVersionListener();

  // Realtime subscription to catalog_updates for instant catalog updates
  useEffect(() => {
    if (!isLiveMode()) return;

    console.log("[Courses] Setting up realtime subscription for catalog updates");

    const channel = supabase
      .channel('catalog-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'catalog_updates',
        },
        async (payload: { new: { course_title?: string; [key: string]: unknown } }) => {
          const update = payload.new;
          console.log("[Courses] 🔔 Catalog update event received:", update);
          
          // Clear all caches
          console.log("[Courses] 🗑️ Clearing all catalog caches");
          localStorage.removeItem('catalogJson');
          localStorage.removeItem('catalogEtag');
          localStorage.removeItem('catalogVersions');
          localStorage.removeItem('course-catalog-cache');
          
          // Force fresh fetch with cache-busting
          try {
            console.log("[Courses] 🔄 Fetching fresh catalog...");
            const freshCatalog = await getCourseCatalog();
            console.log("[Courses] ✅ Fresh catalog loaded:", freshCatalog.courses.length, "courses");
            setCourses(freshCatalog.courses);
            setFilteredCourses(freshCatalog.courses);
            
            // Show toast with course title
            toast.success("New course available!", {
              description: update.course_title ? `"${update.course_title}" has been added.` : "Check it out now!",
            });
          } catch (err) {
            console.error("[Courses] ❌ Failed to load fresh catalog:", err);
            toast.error("Failed to load new course");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Load course catalog (or recommended courses if filtering by KO)
  const loadCatalog = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // If filtering by KO, load recommended courses
        if (recommendedFor) {
          console.log("[Courses] Loading recommended courses for KO:", recommendedFor);
          
          // Get KO name for display
          const ko = MOCK_KNOWLEDGE_OBJECTIVES.find(k => k.id === recommendedFor);
          setKoName(ko?.name || null);
          
          // Get recommended courses
          const recommended = await getRecommendedCourses({
            koId: recommendedFor,
            studentId,
          });
          
          // Load full catalog to match against
          const catalog = await getCourseCatalog();
          
          // Filter catalog by recommended course IDs
          const recommendedIds = new Set(recommended.map(r => r.courseId));
          const recommendedCourses = catalog.courses
            .filter(c => recommendedIds.has(c.id))
            .map(course => {
              const rec = recommended.find(r => r.courseId === course.id);
              return {
                ...course,
                // Augment with KO-specific data
                koRelevance: rec?.relevance,
                koExerciseCount: rec?.exerciseCount,
              };
            });
          
          console.log("[Courses] ✅ Loaded", recommendedCourses.length, "recommended courses");
          setCourses(recommendedCourses);
          setFilteredCourses(recommendedCourses);
          setError(null);
          return;
        }
        
        console.log("[Courses] Loading catalog...");
        
        // Always clear catalog cache on mount to ensure fresh data
        console.log("[Courses] Clearing catalog cache to fetch fresh data");
        localStorage.removeItem("catalogJson");
        localStorage.removeItem("catalogEtag");
        localStorage.removeItem("catalogVersions");
        localStorage.removeItem("catalog.bust");
        localStorage.removeItem("course-catalog-cache");
        
        // Fetch fresh catalog (timeout increased to 30s)
        console.log("[Courses] 🔄 Starting getCourseCatalog()...");
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => {
            console.error("[Courses] ⏱️ Catalog load timeout after 30s");
            reject(new Error('Catalog load timeout after 30s'));
          }, 30000)
        );
        
        const catalogPromise = getCourseCatalog();
        
        const catalog = await Promise.race([
          catalogPromise,
          timeoutPromise
        ]) as Awaited<ReturnType<typeof getCourseCatalog>>;
        
        console.log("[Courses] ✅ Loaded", catalog.courses.length, "courses");
        setCourses(catalog.courses);
        setFilteredCourses(catalog.courses);
        setError(null);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to load courses";
        setError(errorMsg);
        console.error("[Courses] ❌ Catalog error:", err);
        toast.error(`Failed to load catalog: ${errorMsg}`);
      } finally {
        console.log("[Courses] 🏁 Loading complete, setting loading=false");
        setLoading(false);
      }
  };

  useEffect(() => {
    loadCatalog();

    // Listen for catalog version change events
    const handleVersionChange = () => {
      console.log("[Courses] Catalog version changed, reloading...");
      loadCatalog();
    };

    window.addEventListener('catalog-version-changed', handleVersionChange);
    
    return () => {
      window.removeEventListener('catalog-version-changed', handleVersionChange);
    };
  }, [recommendedFor, studentId]);

  // Server-side search with debouncing
  useEffect(() => {
    // Don't search if we're in recommended mode
    if (recommendedFor) {
      // Use client-side filtering for recommended courses
      if (!searchQuery.trim()) {
        setFilteredCourses(courses);
        return;
      }
      const query = searchQuery.toLowerCase();
      const filtered = courses.filter(
        (course) =>
          course.title.toLowerCase().includes(query) ||
          course.subject.toLowerCase().includes(query) ||
          course.description.toLowerCase().includes(query) ||
          course.gradeBand.toLowerCase().includes(query)
      );
      setFilteredCourses(filtered);
      return;
    }

    // Debounce server-side search
    const timeoutId = setTimeout(async () => {
      try {
        if (!searchQuery.trim()) {
          // Empty search - reload full catalog
          const catalog = await getCourseCatalog();
          setCourses(catalog.courses);
          setFilteredCourses(catalog.courses);
        } else {
          // Perform server-side search
          console.log('[Courses] Searching for:', searchQuery);
          const results = await searchCourses({ search: searchQuery, limit: 100 });
          console.log('[Courses] Search results:', results.items.length, 'courses');
          
          // Convert API response to CourseCatalogItem format
          const searchResults: CourseCatalogItem[] = results.items.map(item => ({
            id: item.id,
            title: item.title,
            subject: item.subject,
            description: item.description,
            gradeBand: item.grade || 'All Grades',
            itemCount: item.itemCount ?? 0,
            contentVersion: (item as any).contentVersion || '',
            duration: '15 min',
            difficulty: 'Intermediate',
          }));
          
          setFilteredCourses(searchResults);
        }
      } catch (err) {
        console.error('[Courses] Search error:', err);
        // Fall back to client-side filtering on error
        const query = searchQuery.toLowerCase();
        const filtered = courses.filter(
          (course) =>
            course.title.toLowerCase().includes(query) ||
            course.subject.toLowerCase().includes(query) ||
            course.description.toLowerCase().includes(query) ||
            course.gradeBand.toLowerCase().includes(query)
        );
        setFilteredCourses(filtered);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery, recommendedFor, courses]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadCatalog();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <div className="inline-flex p-6 rounded-2xl bg-primary/10 mb-4 animate-pulse">
            <BookOpen className="h-12 w-12 text-primary" />
          </div>
          <p className="text-xl font-medium">Loading course catalog...</p>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-2">Error Loading Courses</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={loadCatalog} data-cta-id="courses-retry">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          {recommendedFor && koName && (
            <Alert className="mb-6 border-primary/30 bg-primary/5">
              <Target className="h-4 w-4 text-primary" />
              <AlertDescription className="flex items-center justify-between">
                <div>
                  <span className="font-semibold">Skill Focus:</span> {koName}
                  <p className="text-xs text-muted-foreground mt-1">
                    Showing {filteredCourses.length} courses with exercises for this skill
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchParams({});
                  }}
                  data-cta-id="courses-clear-filter"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear Filter
                </Button>
              </AlertDescription>
            </Alert>
          )}
          
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 rounded-2xl bg-primary/10">
              <BookOpen className="h-10 w-10 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl font-bold mb-2">
                {recommendedFor ? 'Recommended Courses' : 'Course Catalog'}
              </h1>
              <p className="text-xl text-muted-foreground">
                {recommendedFor 
                  ? `Practice ${koName} with these courses`
                  : `Explore ${courses.length} interactive learning experiences`}
              </p>
            </div>
          </div>

          {/* Search / Actions */}
          <div className="flex gap-3 items-center max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search courses by title, subject, or grade..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              variant="outline"
              size="icon"
              className="shrink-0"
              title="Refresh catalog - Check for newly uploaded courses"
              aria-label="Refresh catalog to check for newly uploaded courses"
              data-cta-id="courses-refresh"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const courseId = window.prompt('Enter courseId to enqueue media from [IMAGE:] markers:');
                if (!courseId) return;
                try {
                  const { data, error } = await supabase.functions.invoke('enqueue-course-media', {
                    body: { courseId, limit: 6 },
                  });
                  if (error) throw error;
                  toast.success(`Enqueued ${data?.enqueued ?? 0} media job(s)`, { description: data?.skipped ? `${data.skipped} skipped (already exist)` : undefined });
                } catch (err: any) {
                  toast.error(`Failed to enqueue media: ${err?.message || 'Error'}`);
                }
              }}
            >
              Enqueue Media…
            </Button>
          </div>
        </div>

        {/* Course Grid */}
        {filteredCourses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map((course) => {
              const augmentedCourse = course as CourseCatalogItem & { koRelevance?: number; koExerciseCount?: number };
              return (
                <div key={course.id} className="relative">
                  <CourseCard 
                    course={course} 
                    skillFocus={recommendedFor || undefined}
                  />
                  {recommendedFor && augmentedCourse.koExerciseCount && (
                    <Badge 
                      variant="secondary" 
                      className="absolute top-2 right-2"
                    >
                      {augmentedCourse.koExerciseCount} exercises
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-lg text-muted-foreground">
              {recommendedFor 
                ? `No courses found for "${koName}"`
                : `No courses found matching "${searchQuery}"`}
            </p>
          </div>
        )}
      </div>
    </PageContainer>
  );
};

export default Courses;
