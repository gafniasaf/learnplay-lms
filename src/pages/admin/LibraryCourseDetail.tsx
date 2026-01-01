import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, FileJson } from "lucide-react";
import { useMCP } from "@/hooks/useMCP";

type Envelope = {
  id?: string;
  format?: string;
  version?: string | number;
  content?: unknown;
};

function isEnvelope(x: unknown): x is Envelope {
  return !!x && typeof x === "object" && "content" in (x as any) && "format" in (x as any);
}

export default function LibraryCourseDetail() {
  const navigate = useNavigate();
  const { courseId: courseIdParam } = useParams();
  const courseId = useMemo(() => decodeURIComponent(courseIdParam ?? "").trim(), [courseIdParam]);
  const mcp = useMCP();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!courseId) {
        setError("Missing courseId");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const res = await mcp.getLibraryCourseContent(courseId);
        if (cancelled) return;
        setPayload(res);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setPayload(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, mcp]);

  const env = isEnvelope(payload) ? payload : null;
  const title =
    env && env.content && typeof env.content === "object" && (env.content as any).title
      ? String((env.content as any).title)
      : courseId;

  return (
    <PageContainer>
      <div className="flex items-center gap-3 mb-6">
        <Button
          data-cta-id="cta-admin-library-course-back"
          data-action="navigate"
          variant="secondary"
          onClick={() => navigate("/admin/library-courses")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
          Back
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{title}</h1>
          <p className="truncate text-sm text-muted-foreground">{courseId}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            Raw course.json (envelope)
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          </CardTitle>
          <CardDescription>
            {error
              ? `Error: ${error}`
              : env?.format
                ? `format=${env.format}`
                : "Format unknown"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : (
            <pre className="max-h-[70vh] overflow-auto rounded-md bg-muted p-4 text-xs">
              {JSON.stringify(payload, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}



