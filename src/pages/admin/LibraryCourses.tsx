import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, ArrowLeft, ArrowRight, Library } from "lucide-react";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";
import { isDevAgentMode } from "@/lib/api/common";
import { useToast } from "@/hooks/use-toast";

type FormatFilter = "mes" | "library" | "all";

type ListCoursesResponse = {
  items: Array<{
    id: string;
    title?: string;
    subject?: string | null;
    description?: string;
    format?: string;
    updatedAt?: string;
    createdAt?: string;
    itemCount?: number;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export default function LibraryCourses() {
  const navigate = useNavigate();
  const mcp = useMCP();
  const { user, role } = useAuth();
  const { toast } = useToast();

  // Admin guard (consistent with other admin pages)
  const devOverrideRole = typeof window !== "undefined" ? localStorage.getItem("role") : null;
  const devAgent = isDevAgentMode();
  const isAdmin =
    devAgent ||
    role === "admin" ||
    devOverrideRole === "admin" ||
    user?.app_metadata?.role === "admin" ||
    user?.user_metadata?.role === "admin";

  const [search, setSearch] = useState("");
  const [format, setFormat] = useState<FormatFilter>("mes");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ListCoursesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveFormat = useMemo(() => (format === "all" ? "all" : format), [format]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setLoading(true);
      setError(null);
      const res = await mcp.listLibraryCourses({
        page,
        limit: pageSize,
        search: search.trim() ? search.trim() : undefined,
        format: effectiveFormat,
      });
      setData(res as ListCoursesResponse);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setData(null);
      toast({
        title: "Failed to load library courses",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [effectiveFormat, isAdmin, mcp, page, pageSize, search, toast]);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [search, format, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isAdmin) {
    return (
      <PageContainer>
        <Card>
          <CardHeader>
            <CardTitle>Library Courses</CardTitle>
            <CardDescription>Admin access required.</CardDescription>
          </CardHeader>
        </Card>
      </PageContainer>
    );
  }

  const items = data?.items ?? [];

  return (
    <PageContainer>
      <div className="flex items-center gap-3 mb-6">
        <Library className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold">Library Courses</h1>
          <p className="text-sm text-muted-foreground">
            Browse imported/non-playable reference courses (e.g. MES cache).
          </p>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                data-cta-id="cta-admin-library-courses-search"
                data-action="search"
                placeholder="Search by title/subject/id..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button
                data-cta-id="cta-admin-library-courses-refresh"
                data-action="action"
                variant="secondary"
                onClick={load}
                disabled={loading}
              >
                Refresh
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Select value={format} onValueChange={(v) => setFormat(v as FormatFilter)}>
                <SelectTrigger data-cta-id="cta-admin-library-courses-format" data-action="select" className="w-[180px]">
                  <SelectValue placeholder="Format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes">MES</SelectItem>
                  <SelectItem value="library">Library</SelectItem>
                  <SelectItem value="all">All formats</SelectItem>
                </SelectContent>
              </Select>

              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger data-cta-id="cta-admin-library-courses-page-size" data-action="select" className="w-[120px]">
                  <SelectValue placeholder="Page size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Results
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          </CardTitle>
          <CardDescription>
            {error
              ? `Error: ${error}`
              : `Showing ${items.length} of ${data?.total ?? 0} (page ${data?.page ?? page} / ${data?.totalPages ?? 0})`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 && !loading ? (
            <div className="text-sm text-muted-foreground">No results.</div>
          ) : (
            <div className="space-y-2">
              {items.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.title || c.id}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {c.id}
                      {c.format ? ` • format=${c.format}` : ""}
                      {c.subject ? ` • ${c.subject}` : ""}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      data-cta-id="cta-admin-library-courses-open"
                      data-action="navigate"
                      variant="outline"
                      onClick={() => navigate(`/admin/library-courses/${encodeURIComponent(c.id)}`)}
                    >
                      Open
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <Button
              data-cta-id="cta-admin-library-courses-prev"
              data-action="navigate"
              variant="secondary"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={loading || page <= 1}
            >
              <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
              Prev
            </Button>

            <div className="text-xs text-muted-foreground">
              Page {data?.page ?? page} of {data?.totalPages ?? 0}
            </div>

            <Button
              data-cta-id="cta-admin-library-courses-next"
              data-action="navigate"
              variant="secondary"
              onClick={() => setPage((p) => p + 1)}
              disabled={loading || (data?.totalPages ? page >= data.totalPages : false)}
            >
              Next
              <ArrowRight className="h-4 w-4 ml-1" aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}



