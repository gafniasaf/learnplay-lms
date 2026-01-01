import { useEffect, useState } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { useMCP } from '@/hooks/useMCP';

type Summary = { ok: boolean; summary: Record<string, { count: number; errorRate: number; p50: number; p95: number; p99: number }> };

/**
 * Check if running in Lovable preview environment
 */
function isLovablePreview(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname.includes('lovable.app') || hostname.includes('lovableproject.com') || hostname.includes('lovable');
}

export default function Metrics() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mcp = useMCP();

  useEffect(() => {
    // Skip metrics call in Lovable preview (mcp-metrics-proxy not deployed/CORS issues)
    if (isLovablePreview()) {
      setError('Metrics service unavailable in preview environments. Use production deployment for full metrics.');
      return;
    }

    (async () => {
      try {
        const json = await mcp.callGet<Summary>('lms.mcpMetricsProxy', { type: 'summary' });
        if (json?.ok !== true) throw new Error('Failed to load metrics');
        setData(json);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Failed to load metrics';
        // Handle CORS errors gracefully
        if (errMsg.toLowerCase().includes('cors') || errMsg.toLowerCase().includes('blocked')) {
          setError('Metrics service unavailable (CORS blocked). This is expected in preview environments.');
        } else {
          setError(errMsg);
        }
      }
    })();
  }, [mcp]);

  return (
    <PageContainer>
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-4">MCP Metrics</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Live aggregate stats for MCP calls (count, error rate, and latency percentiles). If you see “No metrics yet”,
          generate traffic (open dashboards, enqueue jobs) and refresh.
        </p>
        {error && <div className="text-red-600 mb-3">{error}</div>}
        {!data && !error && <div>Loading…</div>}
        {data && (
          (() => {
            const entries = Object.entries(data.summary || {});
            if (entries.length === 0) {
              return (
                <div className="text-sm text-muted-foreground">
                  No metrics recorded yet. This usually means the metrics proxy has not received any calls in the current
                  window, or aggregation hasn’t run yet. Try navigating around the app for a minute, then refresh this
                  page.
                </div>
              );
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {entries.map(([method, s]) => (
                  <div key={method} className="border rounded p-4 bg-white">
                    <div className="font-medium mb-2">{method}</div>
                    <div className="text-sm text-muted-foreground">count: {s.count}</div>
                    <div className="text-sm text-muted-foreground">errors: {(s.errorRate * 100).toFixed(1)}%</div>
                    <div className="text-sm text-muted-foreground">p50: {s.p50}ms</div>
                    <div className="text-sm text-muted-foreground">p95: {s.p95}ms</div>
                    <div className="text-sm text-muted-foreground">p99: {s.p99}ms</div>
                  </div>
                ))}
              </div>
            );
          })()
        )}
      </div>
    </PageContainer>
  );
}
