import { useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Shield, Database, Users, Settings, BarChart3, Plus, Pencil, Trash2, Activity, Gamepad2, Clock, TrendingUp, Wand2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AddCourseModal, type NewCourse } from "@/components/admin/AddCourseModal";
import { toast } from "sonner";
// getApiMode is a utility function, can stay
import { useDashboard } from "@/hooks/useDashboard";
import { getApiMode } from "@/lib/api";

interface Course {
  id: string;
  title: string;
  description: string;
  level: string;
  duration: string;
  enrollments?: number;
}

const initialCourses: Course[] = [
  {
    id: "modals",
    title: "English Modals",
    description: "Master modal verbs in English",
    level: "Intermediate",
    duration: "30 min",
    enrollments: 245,
  },
  {
    id: "math-101",
    title: "Math Adventures",
    description: "Fun introduction to mathematics",
    level: "Beginner",
    duration: "25 min",
    enrollments: 223,
  },
  {
    id: "science-lab",
    title: "Science Lab",
    description: "Hands-on science experiments",
    level: "Intermediate",
    duration: "40 min",
    enrollments: 198,
  },
  {
    id: "reading-fun",
    title: "Reading Fun",
    description: "Improve reading comprehension",
    level: "Beginner",
    duration: "25 min",
    enrollments: 267,
  },
];

const Admin = () => {
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [showAddModal, setShowAddModal] = useState(false);
  const { dashboard } = useDashboard("admin");
  const isLive = getApiMode() === "live";

  const handleAddCourse = (newCourse: NewCourse) => {
    setCourses([...courses, { ...newCourse, enrollments: 0 }]);
  };

  const handleDeleteCourse = (id: string) => {
    setCourses(courses.filter((c) => c.id !== id));
    toast.success("Course deleted");
  };

  // Live mode stats display
  // Note: Admin dashboard uses get-dashboard Edge Function which returns teacher stats
  // The transformed AdminDashboard has different stats, so we show admin-specific stats instead
  const renderLiveStats = () => {
    if (!isLive || !dashboard || dashboard.role !== 'admin') return null;

    const stats = dashboard.stats as {
      totalSchools?: number;
      totalStudents?: number;
      totalTeachers?: number;
      activeClasses?: number;
      coursesPublished?: number;
      avgSystemProgress?: number;
      activeLicenses?: number;
      licenseUsage?: number;
    };

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="p-6 rounded-2xl bg-gradient-to-br from-role-admin/10 to-role-admin/5 border border-role-admin/20">
          <Activity className="h-8 w-8 text-role-admin mb-2" />
          <p className="text-2xl font-bold">{stats.totalSchools ?? 0}</p>
          <p className="text-sm text-muted-foreground">Schools</p>
        </div>
        
        <div className="p-6 rounded-2xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20">
          <Gamepad2 className="h-8 w-8 text-accent mb-2" />
          <p className="text-2xl font-bold">{stats.totalStudents ?? 0}</p>
          <p className="text-sm text-muted-foreground">Students</p>
        </div>
        
        <div className="p-6 rounded-2xl bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-500/20">
          <TrendingUp className="h-8 w-8 text-orange-500 mb-2" />
          <p className="text-2xl font-bold">{stats.totalTeachers ?? 0}</p>
          <p className="text-sm text-muted-foreground">Teachers</p>
        </div>
        
        <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
          <BarChart3 className="h-8 w-8 text-primary mb-2" />
          <p className="text-2xl font-bold">{stats.coursesPublished ?? 0}</p>
          <p className="text-sm text-muted-foreground">Courses</p>
        </div>
      </div>
    );
  };

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-role-admin/10">
              <Shield className="h-8 w-8 text-role-admin" />
            </div>
            <div>
              <h1 className="text-4xl font-bold">Admin Portal</h1>
              <p className="text-muted-foreground">System administration</p>
            </div>
          </div>
        </div>

        {/* Live Stats or Mock Stats */}
        {isLive && renderLiveStats()}

        {/* Stats Grid - Mock Mode */}
        {!isLive && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          <div className="p-6 rounded-2xl border bg-card">
            <Users className="h-8 w-8 text-role-admin mb-2" />
            <p className="text-2xl font-bold">487</p>
            <p className="text-sm text-muted-foreground">Total Users</p>
          </div>

          <div className="p-6 rounded-2xl border bg-card">
            <Database className="h-8 w-8 text-role-admin mb-2" />
            <p className="text-2xl font-bold">{courses.length}</p>
            <p className="text-sm text-muted-foreground">Courses</p>
          </div>

          <div className="p-6 rounded-2xl border bg-card">
            <Settings className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-2xl font-bold">42</p>
            <p className="text-sm text-muted-foreground">Active Classes</p>
          </div>

          <div className="p-6 rounded-2xl border bg-card">
            <BarChart3 className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-2xl font-bold">98%</p>
            <p className="text-sm text-muted-foreground">System Health</p>
          </div>
        </div>
        )}

        {/* Course Catalog Management */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Course Catalog</h2>
            <div className="flex gap-2">
              <Link to="/admin/courses/author" data-cta-id="admin-ai-author">
                <Button variant="outline">
                  <Wand2 className="h-4 w-4 mr-2" />
                  AI Course Author
                </Button>
              </Link>
              <Button onClick={() => setShowAddModal(true)} data-cta-id="admin-add-course">
                <Plus className="h-4 w-4 mr-2" />
                Add Course
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {courses.map((course) => (
              <div
                key={course.id}
                className="flex items-center justify-between p-6 rounded-2xl border bg-card hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="p-3 rounded-2xl bg-primary/10">
                    <Database className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-lg">{course.title}</h3>
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                        {course.level}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {course.description || "No description"}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>ID: {course.id}</span>
                      <span>•</span>
                      <span>Duration: {course.duration}</span>
                      {course.enrollments !== undefined && (
                        <>
                          <span>•</span>
                          <span>{course.enrollments} students</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link to={`/admin/courses/ai?edit=${course.id}`} aria-label={`Edit Course ${course.title}`} data-cta-id="admin-edit-course">
                    <Button variant="ghost" size="sm" title="Edit Course">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteCourse(course.id)}
                    data-cta-id="admin-delete-course"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add Course Modal */}
        <AddCourseModal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddCourse}
        />
      </div>
    </PageContainer>
  );
};

export default Admin;
