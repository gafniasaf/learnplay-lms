import { useEffect, useState } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';

type Summary = { ok: boolean; summary: Record<string, { count: number; errorRate: number; p50: number; p95: number; p99: number }> };

export default function Metrics() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/functions/v1/mcp-metrics-proxy?type=summary');
        const json = await res.json();
        if (!res.ok || json?.ok !== true) throw new Error('Failed to load metrics');
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load metrics');
      }
    })();
  }, []);

  return (
    <PageContainer>
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-4">MCP Metrics</h1>
        {error && <div className="text-red-600 mb-3">{error}</div>}
        {!data && !error && <div>Loading…</div>}
        {data && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(data.summary).map(([method, s]) => (
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
        )}
      </div>
    </PageContainer>
  );
}


