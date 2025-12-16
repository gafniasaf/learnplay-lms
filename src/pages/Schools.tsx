import { useEffect, useMemo, useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { GraduationCap, UsersRound, BookOpen, BarChart3 } from "lucide-react";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, isDevAgentMode } from "@/lib/api/common";
import type { SchoolDashboardSummaryResponse } from "@/lib/types/edge-functions";

const Schools = () => {
  const mcp = useMCP();
  const { user, loading: authLoading } = useAuth();
  const devAgent = useMemo(() => isDevAgentMode(), []);
  const [data, setData] = useState<SchoolDashboardSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for auth to load unless we're in dev-agent mode (no Supabase session required).
    if (authLoading && !devAgent) return;

    // In normal mode, require a signed-in user before fetching.
    if (!devAgent && !user?.id) {
      setError("SIGN_IN_REQUIRED");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await mcp.getSchoolDashboardSummary();
        setData(resp);
      } catch (error) {
        const msg =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Failed to load school dashboard";
        console.error("[Schools] Failed to load school dashboard:", error);
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [authLoading, devAgent, user?.id, mcp]);

  if (loading) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <div className="inline-flex p-6 rounded-2xl bg-role-schools/10 mb-4 animate-pulse">
            <GraduationCap className="h-12 w-12 text-role-schools" />
          </div>
          <p className="text-xl font-medium">Loading school dashboard...</p>
        </div>
      </PageContainer>
    );
  }

  if (error === "SIGN_IN_REQUIRED") {
    return (
      <PageContainer>
        <div className="max-w-3xl mx-auto text-center py-12">
          <div className="inline-flex p-6 rounded-2xl bg-role-schools/10 mb-4">
            <GraduationCap className="h-12 w-12 text-role-schools" />
          </div>
          <h1 className="text-2xl font-bold mb-2">School Portal</h1>
          <p className="text-muted-foreground">
            Sign in to view your organization’s school dashboard.
          </p>
        </div>
      </PageContainer>
    );
  }

  if (!data) {
    return (
      <PageContainer>
        <div className="max-w-3xl mx-auto text-center py-12">
          <div className="inline-flex p-6 rounded-2xl bg-role-schools/10 mb-4">
            <GraduationCap className="h-12 w-12 text-role-schools" />
          </div>
          <h1 className="text-2xl font-bold mb-2">School Portal</h1>
          <p className="text-muted-foreground">
            {error ? `Failed to load: ${error}` : "Failed to load school dashboard."}
          </p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-2xl bg-role-schools/10">
            <GraduationCap className="h-8 w-8 text-role-schools" />
          </div>
          <div>
            <h1 className="text-4xl font-bold">School Portal</h1>
            <p className="text-muted-foreground">Organization overview</p>
          </div>
        </div>

        {/* Overview Stats (real org counts) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-role-schools/10 to-role-schools/5 border border-role-schools/20">
            <UsersRound className="h-8 w-8 text-role-schools mb-2" />
            <p className="text-2xl font-bold">{data.stats.totalStudents}</p>
            <p className="text-sm text-muted-foreground">Students</p>
          </div>
          
          <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
            <GraduationCap className="h-8 w-8 text-primary mb-2" />
            <p className="text-2xl font-bold">{data.stats.totalTeachers}</p>
            <p className="text-sm text-muted-foreground">Teachers</p>
          </div>
          
          <div className="p-6 rounded-2xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20">
            <BookOpen className="h-8 w-8 text-accent mb-2" />
            <p className="text-2xl font-bold">{data.stats.activeClasses}</p>
            <p className="text-sm text-muted-foreground">Classes</p>
          </div>
          
          <div className="p-6 rounded-2xl bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20">
            <BarChart3 className="h-8 w-8 text-green-500 mb-2" />
            <p className="text-2xl font-bold">{data.stats.coursesAvailable}</p>
            <p className="text-sm text-muted-foreground">Courses Visible</p>
          </div>
        </div>

        <div className="p-8 rounded-2xl border bg-card text-center">
          <p className="text-muted-foreground">
            Live data — these counts are computed from your org’s real classes, enrollments, and catalog visibility.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            School-wide analytics and management tools are not implemented yet.
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            Updated: {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>
      </div>
    </PageContainer>
  );
};

export default Schools;
