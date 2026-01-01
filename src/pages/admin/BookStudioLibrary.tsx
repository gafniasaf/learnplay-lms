import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";
import { isDevAgentMode } from "@/lib/api/common";
import { cn } from "@/lib/utils";

type BookRow = {
  id: string;
  organization_id: string;
  title: string;
  level: string;
  source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type BookListResponse =
  | { ok: true; scope: string; books: BookRow[]; total: number; limit: number; offset: number }
  | { ok: false; error: any; httpStatus?: number };

type LevelFilter = "all" | "n3" | "n4" | "published" | "draft";

export default function BookStudioLibrary() {
  const navigate = useNavigate();
  const mcp = useMCP();
  const { toast } = useToast();
  const { user, role, loading: authLoading } = useAuth();

  const devAgent = isDevAgentMode();
  const devOverrideRole = typeof window !== "undefined" ? localStorage.getItem("role") : null;
  const isAdmin =
    devAgent ||
    role === "admin" ||
    devOverrideRole === "admin" ||
    user?.app_metadata?.role === "admin" ||
    user?.user_metadata?.role === "admin";

  const [loading, setLoading] = useState(true);
  const [books, setBooks] = useState<BookRow[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LevelFilter>("all");

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await mcp.callGet("lms.bookList", {
        scope: "books",
        limit: "200",
        offset: "0",
      })) as BookListResponse;

      if ((res as any)?.ok !== true) {
        throw new Error((res as any)?.error?.message || "Failed to load books");
      }
      setBooks((res as any).books || []);
    } catch (e) {
      toast({
        title: "Failed to load books",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }, [mcp, toast]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      navigate("/admin");
      return;
    }
    void loadBooks();
  }, [authLoading, isAdmin, navigate, loadBooks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books
      .filter((b) => String(b?.source || "").trim().toLowerCase() !== "e2e")
      .filter((b) => {
        if (filter === "n3" || filter === "n4") return String(b.level).toLowerCase() === filter;
        // NOTE: published/draft states are not in the books schema yet; keep as UI filters for future.
        if (filter === "published" || filter === "draft") return true;
        return true;
      })
      .filter((b) => {
        if (!q) return true;
        const hay = `${b.id} ${b.title} ${b.level} ${b.source || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  }, [books, filter, query]);

  const stats = useMemo(() => {
    const total = books.filter((b) => String(b?.source || "").trim().toLowerCase() !== "e2e").length;
    const n3 = books.filter((b) => String(b.level).toLowerCase() === "n3").length;
    const n4 = books.filter((b) => String(b.level).toLowerCase() === "n4").length;
    return { total, n3, n4 };
  }, [books]);

  const goToBook = useCallback(
    (bookId: string) => {
      navigate(`/admin/book-studio/${encodeURIComponent(bookId)}`);
    },
    [navigate]
  );

  const filterBtn = (id: LevelFilter, label: string, ctaId: string) => (
    <Button
      key={id}
      variant={filter === id ? "default" : "outline"}
      size="sm"
      onClick={() => setFilter(id)}
      data-cta-id={ctaId}
      data-action="action"
    >
      {label}
    </Button>
  );

  if (authLoading || (!isAdmin && !devAgent)) {
    return (
      <PageContainer>
        <div className="text-sm text-muted-foreground">Loading…</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Book Studio</h1>
            <p className="text-sm text-muted-foreground">Browse books, edit chapters, and manage images/versions.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search books…"
              className="w-full sm:w-72"
              data-cta-id="cta-bookstudio-search"
              data-action="edit"
            />
            <Button
              variant="outline"
              onClick={() => void loadBooks()}
              disabled={loading}
              data-cta-id="cta-bookstudio-refresh"
              data-action="action"
            >
              Refresh
            </Button>
            <Button
              onClick={() => navigate("/admin/books")}
              data-cta-id="cta-bookstudio-ingest-new"
              data-action="navigate"
              data-target="/admin/books"
            >
              Ingest book
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm text-muted-foreground">Total</div>
            <div className="text-2xl font-mono font-semibold">{stats.total}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm text-muted-foreground">N3</div>
            <div className="text-2xl font-mono font-semibold">{stats.n3}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm text-muted-foreground">N4</div>
            <div className="text-2xl font-mono font-semibold">{stats.n4}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {filterBtn("all", "All", "cta-bookstudio-filter-all")}
          {filterBtn("n3", "N3", "cta-bookstudio-filter-n3")}
          {filterBtn("n4", "N4", "cta-bookstudio-filter-n4")}
          {filterBtn("published", "Published", "cta-bookstudio-filter-published")}
          {filterBtn("draft", "Drafts", "cta-bookstudio-filter-draft")}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((b) => {
            const level = String(b.level || "").toLowerCase();
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => goToBook(b.id)}
                className={cn(
                  "text-left rounded-xl border bg-card hover:bg-accent/10 transition-colors p-4",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
                data-cta-id={`cta-bookstudio-open-${b.id}`}
                data-action="navigate"
                data-target={`/admin/book-studio/${encodeURIComponent(b.id)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{b.title || b.id}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{b.id}</div>
                  </div>
                  <Badge variant="outline" className="uppercase">
                    {level || "—"}
                  </Badge>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Updated: {b.updated_at ? new Date(b.updated_at).toLocaleString() : "—"}
                </div>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => navigate("/admin/books")}
            className={cn(
              "rounded-xl border border-dashed bg-background hover:bg-accent/10 transition-colors p-4",
              "flex flex-col items-center justify-center gap-2 text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
            data-cta-id="cta-bookstudio-add-book"
            data-action="navigate"
            data-target="/admin/books"
          >
            <div className="text-2xl">+</div>
            <div className="text-sm font-medium">Add / Ingest</div>
          </button>
        </div>

        {loading && (
          <div className="text-sm text-muted-foreground" data-cta-id="cta-bookstudio-loading" data-action="noop">
            Loading…
          </div>
        )}
      </div>
    </PageContainer>
  );
}


