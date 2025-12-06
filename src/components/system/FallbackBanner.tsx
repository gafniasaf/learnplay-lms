import { useEffect, useState } from "react";

export function FallbackBanner() {
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/functions/v1/mcp-metrics-proxy?type=summary', { method: 'GET' });
        if (!cancelled && res.status === 502) {
          setUnavailable(true);
          return;
        }
        const j = await res.json().catch(() => ({}));
        if (!cancelled && j?.error === 'mcp_unavailable') setUnavailable(true);
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!unavailable) return null;

  return (
    <div data-testid="mcp-fallback-banner" className="w-full bg-amber-100 text-amber-900 text-sm px-3 py-2 text-center">
      Observability proxy unavailable in this environment. Actions will use direct Edge functions with reduced metrics.
    </div>
  );
}


