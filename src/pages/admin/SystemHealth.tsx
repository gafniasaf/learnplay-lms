import { useEffect, useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

type HealthResponse = {
  ok?: boolean;
  data?: {
    ok?: boolean;
    tokenCheck?: any;
    edge?: any;
  };
};

type EnvAuditResponse = {
  ok?: boolean;
  data?: {
    ok?: boolean;
    missing?: string[];
    inconsistent?: string[];
    invalid?: string[];
    probes?: Record<string, any>;
  };
};

type IntegrityResponse = {
  ok?: boolean;
  data?: {
    ok: boolean;
    issues: string[];
    suggestions: string[];
    envelopeSummary: { id: string; format: string; version: number } | null;
  };
};

type UiAuditSummary = {
  ok: boolean;
  total: number;
  byType: Record<string, number>;
};
type UiAuditRun = {
  ok: boolean;
  issues: Array<{
    type: string;
    file: string;
    line?: number;
    detail: string;
    suggestion?: string;
    severity?: string;
    component?: string;
    element?: string;
  }>;
};

export default function SystemHealthPage() {
  const mcp = useMCP();
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<HealthResponse["data"] | null>(null);
  const [env, setEnv] = useState<EnvAuditResponse["data"] | null>(null);

  const [courseId, setCourseId] = useState("");
  const [integrity, setIntegrity] = useState<IntegrityResponse["data"] | null>(null);
  const [uiSummary, setUiSummary] = useState<UiAuditSummary | null>(null);
  const [uiRun, setUiRun] = useState<UiAuditRun | null>(null);

  const callProxy = async (method: string, params: any = {}) => {
    return await mcp.call(method, params);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [h, e, u] = await Promise.all([
        callProxy("lms.health", {}).catch(err => {
          console.warn('[SystemHealth] Health check failed:', err);
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }),
        callProxy("lms.envAudit", {}).catch(err => {
          console.warn('[SystemHealth] Env audit failed:', err);
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }),
        callProxy("lms.uiAudit.summary", {}).catch(err => {
          console.warn('[SystemHealth] UI audit failed:', err);
          return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }),
      ]);
      setHealth((h as any)?.data || null);
      setEnv((e as any)?.data || null);
      setUiSummary((u as any)?.data || null);

      // Show warning if any calls failed, but don't throw
      const failures = [h, e, u].filter(r => r && !(r as any).ok && (r as any).error);
      if (failures.length > 0) {
        toast.warning(`Some health checks failed (${failures.length}/3). Check console for details.`);
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to load system health");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const runIntegrity = async () => {
    if (!courseId) {
      toast.error("Enter a courseId");
      return;
    }
    try {
      const res = await callProxy("lms.checkStorageIntegrity", { courseId });
      setIntegrity((res as any)?.data || null);
      if ((res as any)?.data?.ok) {
        toast.success("Storage OK");
      } else {
        toast.warning("Storage issues detected");
      }
    } catch (e: any) {
      console.error(e);
      toast.error("Integrity check failed");
    }
  };

  const tc = health?.tokenCheck || {};

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">System Health</h1>
          <Button onClick={load} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>MCP Health / Token Check</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>OK: {String(health?.ok)}</div>
              <div>Edge: {health?.edge ? JSON.stringify(health.edge) : "—"}</div>
              <div className="mt-2 font-medium">Accepted By Edge:</div>
              <div>{Array.isArray(tc.acceptedByEdge) ? tc.acceptedByEdge.join(", ") : "—"}</div>
              <div className="mt-2 font-medium">Tokens:</div>
              <pre className="bg-muted p-2 rounded">{JSON.stringify(tc.tokens || {}, null, 2)}</pre>
              <div className="mt-2 font-medium">Protected Functions:</div>
              <pre className="bg-muted p-2 rounded">{JSON.stringify(tc.protected || [], null, 2)}</pre>
              {Array.isArray(tc.mismatches) && tc.mismatches.length > 0 && (
                <div className="text-amber-600">Mismatches: {tc.mismatches.join(", ")}</div>
              )}
              {Array.isArray(tc.suggestions) && tc.suggestions.length > 0 && (
                <ul className="list-disc list-inside text-amber-600">
                  {tc.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Environment Audit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>OK: {String(env?.ok)}</div>
              <div className="font-medium">Missing</div>
              <div>{(env?.missing || []).join(", ") || "—"}</div>
              <div className="font-medium">Inconsistent</div>
              <div>{(env?.inconsistent || []).join(", ") || "—"}</div>
              <div className="font-medium">Invalid</div>
              <div>{(env?.invalid || []).join(", ") || "—"}</div>
              <div className="font-medium">Probes</div>
              <pre className="bg-muted p-2 rounded">{JSON.stringify(env?.probes || {}, null, 2)}</pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>UI Wiring Audit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>OK: {uiSummary ? String(uiSummary.ok) : "—"}</div>
              <div>Total Issues: {uiSummary ? uiSummary.total : "—"}</div>
              {uiSummary && (
                <pre className="bg-muted p-2 rounded">{JSON.stringify(uiSummary.byType, null, 2)}</pre>
              )}
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const res = await callProxy("lms.uiAudit.run", {});
                    setUiRun((res as any)?.data || null);
                    if ((res as any)?.data?.ok) toast.success("UI OK");
                    else toast.warning("UI issues found");
                  } catch (e: any) {
                    console.error(e);
                    toast.error("UI audit failed");
                  }
                }}
              >
                Run UI Audit
              </Button>
              {uiRun && (
                <div className="space-y-2 mt-2">
                  <div>OK: {String(uiRun.ok)}</div>
                  <ul className="list-disc list-inside text-amber-600">
                    {uiRun.issues.map((i, idx) => (
                      <li key={idx}>
                        [{i.severity || "error"}] {i.type} — {i.file}
                        {i.line ? `:${i.line}` : ""}
                        <div className="text-foreground/80">{i.detail}</div>
                        {i.suggestion && <div className="text-foreground/70">Suggestion: {i.suggestion}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Storage Integrity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex gap-2">
              <Input placeholder="courseId" value={courseId} onChange={(e) => setCourseId(e.target.value)} />
              <Button onClick={runIntegrity}>Check</Button>
            </div>
            {integrity && (
              <div className="space-y-2">
                <div>OK: {String(integrity.ok)}</div>
                {integrity.envelopeSummary && (
                  <div>Envelope: {JSON.stringify(integrity.envelopeSummary)}</div>
                )}
                {integrity.issues?.length > 0 && (
                  <>
                    <div className="font-medium">Issues</div>
                    <ul className="list-disc list-inside text-amber-600">
                      {integrity.issues.map((i, idx) => <li key={idx}>{i}</li>)}
                    </ul>
                  </>
                )}
                {integrity.suggestions?.length > 0 && (
                  <>
                    <div className="font-medium">Suggestions</div>
                    <ul className="list-disc list-inside text-amber-600">
                      {integrity.suggestions.map((s, idx) => <li key={idx}>{s}</li>)}
                    </ul>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}


