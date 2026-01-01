import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";
import { isDevAgentMode } from "@/lib/api/common";

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

type OverlayVersionRow = {
  id: string;
  overlay_id: string;
  snapshot_path: string;
  created_at: string;
  created_by?: string | null;
  note?: string | null;
};

type OverlayVersionsResponse =
  | { ok: true; overlayId: string; versions: OverlayVersionRow[]; total: number; limit: number; offset: number }
  | { ok: false; error: any; httpStatus?: number };

export default function BookStudioVersions() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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

  const bookVersionId = safeStr(searchParams.get("bookVersionId"));
  const overlayId = safeStr(searchParams.get("overlayId"));

  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<OverlayVersionRow[]>([]);
  const [diffMode, setDiffMode] = useState<"unified" | "split">("unified");

  const [canonicalSrc, setCanonicalSrc] = useState("");

  const loadOverlayVersions = useCallback(async () => {
    if (!overlayId) return;
    setLoading(true);
    try {
      const res = (await mcp.callGet("lms.bookOverlayListVersions", {
        overlayId,
        limit: "50",
        offset: "0",
      })) as OverlayVersionsResponse;
      if ((res as any)?.ok !== true) {
        throw new Error((res as any)?.error?.message || "Endpoint not available yet");
      }
      setVersions((res as any).versions || []);
    } catch (e) {
      toast({
        title: "Overlay versions unavailable",
        description: e instanceof Error ? e.message : "Not implemented yet",
        variant: "destructive",
      });
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [overlayId, mcp, toast]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      navigate("/admin");
      return;
    }
    void loadOverlayVersions();
  }, [authLoading, isAdmin, navigate, loadOverlayVersions]);

  const backTarget = useMemo(() => {
    if (!bookId) return "/admin/book-studio";
    const qs = new URLSearchParams();
    if (bookVersionId) qs.set("bookVersionId", bookVersionId);
    if (overlayId) qs.set("overlayId", overlayId);
    return `/admin/book-studio/${encodeURIComponent(bookId)}${qs.toString() ? `?${qs.toString()}` : ""}`;
  }, [bookId, bookVersionId, overlayId]);

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
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">Version History</h1>
            <div className="text-xs text-muted-foreground font-mono truncate">
              {bookId} • bookVersionId={bookVersionId || "—"} • overlayId={overlayId || "—"}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(backTarget)}
              data-cta-id="cta-bookstudio-versions-back"
              data-action="navigate"
              data-target={backTarget}
            >
              Back
            </Button>
            <Button
              variant="outline"
              onClick={() => toast({ title: "Not implemented", description: "Export for versions is wired after overlay snapshots are stored." })}
              data-cta-id="cta-bookstudio-versions-export"
              data-action="action"
            >
              Export
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <div className="font-medium text-amber-600">BLOCKED (until backend is implemented)</div>
          <div className="text-xs text-muted-foreground mt-1">
            Overlay + image versioning endpoints are implemented in later todos (`book_overlay_versions` / `book_image_versions`).
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Text (overlay) versions</CardTitle>
              <CardDescription>Timeline of overlay snapshots + restore.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={diffMode === "unified" ? "default" : "outline"}
                  onClick={() => setDiffMode("unified")}
                  data-cta-id="cta-bookstudio-diff-toggle-unified"
                  data-action="action"
                >
                  Unified
                </Button>
                <Button
                  size="sm"
                  variant={diffMode === "split" ? "default" : "outline"}
                  onClick={() => setDiffMode("split")}
                  data-cta-id="cta-bookstudio-diff-toggle-split"
                  data-action="action"
                >
                  Split
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void loadOverlayVersions()}
                  disabled={loading}
                  data-cta-id="cta-bookstudio-versions-refresh"
                  data-action="action"
                >
                  Refresh
                </Button>
              </div>

              <Separator />

              {versions.length === 0 ? (
                <div className="text-sm text-muted-foreground">No versions loaded (or endpoint not yet available).</div>
              ) : (
                <div className="space-y-2">
                  {versions.map((v, idx) => (
                    <div key={v.id} className="rounded-md border p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium flex items-center gap-2">
                          <Badge variant="outline">v{versions.length - idx}</Badge>
                          <span className="font-mono text-xs truncate">{v.id}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {v.created_at ? new Date(v.created_at).toLocaleString() : "—"}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toast({ title: "Not implemented", description: "Select/diff UI is wired after snapshot download is implemented." })}
                          data-cta-id={`cta-bookstudio-version-item-${idx}`}
                          data-action="action"
                        >
                          View
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => toast({ title: "Not implemented", description: "Restore endpoint is implemented in later todos." })}
                          data-cta-id={`cta-bookstudio-revert-to-v${idx}`}
                          data-action="action"
                        >
                          Restore
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Image versions</CardTitle>
              <CardDescription>Track mapping changes per canonicalSrc + revert.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Canonical src (image key)</div>
                <Input
                  value={canonicalSrc}
                  onChange={(e) => setCanonicalSrc(e.target.value)}
                  placeholder="e.g. figures/Image_2.7.png"
                  data-cta-id="cta-bookstudio-image-versions-canonical-src"
                  data-action="edit"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toast({
                      title: "Not implemented",
                      description: "Image version list endpoint is added in later todos.",
                    })
                  }
                  data-cta-id="cta-bookstudio-image-versions-load"
                  data-action="action"
                >
                  Load
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toast({
                      title: "Not implemented",
                      description: "Revert is implemented after `book_image_versions` exists.",
                    })
                  }
                  data-cta-id="cta-bookstudio-image-versions-revert"
                  data-action="action"
                >
                  Revert
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                (UI will show image mapping diff + preview once backend endpoints exist.)
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}


