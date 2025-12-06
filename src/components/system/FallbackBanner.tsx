import { useEffect, useState } from "react";
import { callEdgeFunctionGet } from "@/lib/api/common";

export function FallbackBanner() {
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Use MCP proxy via Edge Function helper (infrastructure-level call)
        const response = await callEdgeFunctionGet<{ error?: string }>('mcp-metrics-proxy', { type: 'summary' });
        if (!cancelled && response?.error === 'mcp_unavailable') {
          setUnavailable(true);
        }
      } catch (err) {
        // If 502 or network error, mark as unavailable
        if (!cancelled) {
          const is502 = err instanceof Error && err.message.includes('502');
          if (is502 || err instanceof TypeError) {
            setUnavailable(true);
          }
        }
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


