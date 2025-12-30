import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type BookListResponse =
  | { ok: true; scope: string; books: BookRow[]; total: number; limit: number; offset: number }
  | { ok: false; error: any; httpStatus?: number };

export default function BooksLibrary() {
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

  // Ingest form
  const [canonicalFile, setCanonicalFile] = useState<File | null>(null);
  const [figuresFile, setFiguresFile] = useState<File | null>(null);
  const [tokensFile, setTokensFile] = useState<File | null>(null);

  const [bookId, setBookId] = useState("");
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState<"n3" | "n4" | "">("");
  const [source, setSource] = useState("IDML_EXPORT");
  const [ingesting, setIngesting] = useState(false);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await mcp.callGet("lms.bookList", {
        scope: "books",
        limit: "50",
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

  const handleCanonicalSelected = useCallback(async (file: File | null) => {
    setCanonicalFile(file);
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const inferredId = typeof json?.meta?.id === "string" ? json.meta.id : "";
      const inferredLevel = json?.meta?.level === "n3" || json?.meta?.level === "n4" ? json.meta.level : "";
      const inferredTitle = typeof json?.meta?.title === "string" ? json.meta.title : "";
      if (inferredId) setBookId(inferredId);
      if (inferredLevel) setLevel(inferredLevel);
      if (inferredTitle) setTitle(inferredTitle);
    } catch {
      // Let ingest validation surface a clear error
    }
  }, []);

  const handleIngest = useCallback(async () => {
    if (!canonicalFile) {
      toast({ title: "Canonical JSON required", description: "Select a canonical JSON file to ingest.", variant: "destructive" });
      return;
    }
    if (!bookId.trim()) {
      toast({ title: "bookId required", description: "Provide a Book ID (meta.id).", variant: "destructive" });
      return;
    }
    if (level !== "n3" && level !== "n4") {
      toast({ title: "level required", description: "Select level (n3 or n4).", variant: "destructive" });
      return;
    }

    setIngesting(true);
    try {
      const canonicalText = await canonicalFile.text();
      const canonical = JSON.parse(canonicalText);

      const figures = figuresFile ? JSON.parse(await figuresFile.text()) : undefined;
      const designTokens = tokensFile ? JSON.parse(await tokensFile.text()) : undefined;

      const res = await mcp.call("lms.bookIngestVersion", {
        bookId: bookId.trim(),
        title: title.trim() || undefined,
        level,
        source: source.trim() || undefined,
        canonical,
        figures,
        designTokens,
      });

      if (!(res as any)?.ok) {
        throw new Error((res as any)?.error?.message || "Ingest failed");
      }

      const ingestedVersionId = (res as any)?.bookVersionId as string | undefined;

      toast({ title: "Ingested", description: "Book version ingested successfully." });
      await loadBooks();

      if (ingestedVersionId) {
        navigate(`/admin/books/${encodeURIComponent(bookId.trim())}/versions/${encodeURIComponent(ingestedVersionId)}`);
      }
    } catch (e) {
      toast({
        title: "Ingest failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIngesting(false);
    }
  }, [canonicalFile, figuresFile, tokensFile, bookId, title, level, source, toast, mcp, navigate, loadBooks]);

  const sortedBooks = useMemo(() => {
    return [...books].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  }, [books]);

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Books</h1>
            <p className="text-sm text-muted-foreground">Canonical versions, runs, and artifacts.</p>
          </div>
          <Button
            onClick={() => void loadBooks()}
            variant="outline"
            data-cta-id="cta-admin-books-refresh"
            data-action="action"
          >
            Refresh
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ingest a new Book Version</CardTitle>
            <CardDescription>Upload canonical JSON (and optionally figures/design tokens) to create a version.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bookId">Book ID</Label>
                <Input
                  id="bookId"
                  value={bookId}
                  onChange={(e) => setBookId(e.target.value)}
                  placeholder='e.g. "anatomy-n3"'
                  data-cta-id="cta-admin-books-ingest-bookid"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Optional title"
                  data-cta-id="cta-admin-books-ingest-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="level">Level</Label>
                <Input
                  id="level"
                  value={level}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setLevel(v === "n3" || v === "n4" ? v : (v as any));
                  }}
                  placeholder="n3 or n4"
                  data-cta-id="cta-admin-books-ingest-level"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source">Source</Label>
                <Input
                  id="source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder='e.g. "IDML_EXPORT"'
                  data-cta-id="cta-admin-books-ingest-source"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Canonical JSON (required)</Label>
                <Input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => void handleCanonicalSelected(e.target.files?.[0] || null)}
                  data-cta-id="cta-admin-books-ingest-canonical-file"
                />
              </div>
              <div className="space-y-2">
                <Label>Figures JSON (optional)</Label>
                <Input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => setFiguresFile(e.target.files?.[0] || null)}
                  data-cta-id="cta-admin-books-ingest-figures-file"
                />
              </div>
              <div className="space-y-2">
                <Label>Design tokens JSON (optional)</Label>
                <Input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => setTokensFile(e.target.files?.[0] || null)}
                  data-cta-id="cta-admin-books-ingest-tokens-file"
                />
              </div>
            </div>

            <Button
              onClick={() => void handleIngest()}
              disabled={ingesting}
              data-cta-id="cta-admin-books-ingest"
              data-action="action"
            >
              {ingesting ? "Ingesting…" : "Ingest Version"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Library</CardTitle>
            <CardDescription>{loading ? "Loading…" : `${sortedBooks.length} book(s)`}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedBooks.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.title || b.id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{b.level}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{b.source || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {b.updated_at ? new Date(b.updated_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/admin/books/${encodeURIComponent(b.id)}`)}
                        data-cta-id={`cta-admin-books-open-${b.id}`}
                        data-action="navigate"
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {sortedBooks.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No books yet. Ingest a canonical version to create one.
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


