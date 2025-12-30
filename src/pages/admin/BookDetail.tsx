import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";
import { isDevAgentMode } from "@/lib/api/common";

type BookRow = {
  id: string;
  organization_id: string;
  title: string;
  level: string;
  source?: string | null;
  created_at?: string;
  updated_at?: string;
};

type BookVersionRow = {
  id: string;
  book_id: string;
  book_version_id: string;
  schema_version: string;
  source?: string | null;
  exported_at?: string | null;
  canonical_path: string;
  figures_path?: string | null;
  design_tokens_path?: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
};

export default function BookDetail() {
  const { bookId } = useParams<{ bookId: string }>();
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
  const [book, setBook] = useState<BookRow | null>(null);
  const [versions, setVersions] = useState<BookVersionRow[]>([]);

  const load = useCallback(async () => {
    if (!bookId) return;
    setLoading(true);
    try {
      const [booksRes, versionsRes] = await Promise.all([
        mcp.callGet("lms.bookList", { scope: "books", limit: "200", offset: "0" }) as Promise<any>,
        mcp.callGet("lms.bookList", { scope: "versions", bookId, limit: "200", offset: "0" }) as Promise<any>,
      ]);

      if (booksRes?.ok !== true) throw new Error(booksRes?.error?.message || "Failed to load books");
      if (versionsRes?.ok !== true) throw new Error(versionsRes?.error?.message || "Failed to load versions");

      const match = (booksRes?.books as BookRow[] | undefined)?.find((b) => b.id === bookId) || null;
      setBook(match);
      setVersions((versionsRes?.versions as BookVersionRow[] | undefined) || []);
    } catch (e) {
      toast({
        title: "Failed to load book",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [bookId, mcp, toast]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      navigate("/admin");
      return;
    }
    void load();
  }, [authLoading, isAdmin, navigate, load]);

  const sortedVersions = useMemo(() => {
    return [...versions].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [versions]);

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{book?.title || bookId}</h1>
            <p className="text-sm text-muted-foreground">{bookId}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate("/admin/books")}
              data-cta-id="cta-admin-book-back"
              data-action="navigate"
            >
              Back
            </Button>
            <Button
              variant="outline"
              onClick={() => void load()}
              data-cta-id="cta-admin-book-refresh"
              data-action="action"
            >
              Refresh
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>{loading ? "Loading…" : "Book metadata"}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Level</div>
              <div className="font-medium">
                <Badge variant="outline">{book?.level || "—"}</Badge>
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Source</div>
              <div className="font-medium">{book?.source || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Updated</div>
              <div className="font-medium">
                {book?.updated_at ? new Date(book.updated_at).toLocaleString() : "—"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Versions</CardTitle>
            <CardDescription>{loading ? "Loading…" : `${sortedVersions.length} version(s)`}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Schema</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedVersions.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs">{v.book_version_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{v.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{v.schema_version}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {v.created_at ? new Date(v.created_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/admin/books/${encodeURIComponent(bookId || "")}/versions/${encodeURIComponent(v.book_version_id)}`)}
                        data-cta-id={`cta-admin-book-open-version-${v.book_version_id}`}
                        data-action="navigate"
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {sortedVersions.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No versions yet. Ingest a canonical version from the Books page.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}


