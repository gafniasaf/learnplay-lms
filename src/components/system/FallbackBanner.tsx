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
        // If 502, network error, or CORS error, mark as unavailable
        if (!cancelled) {
          const errMsg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
          const is502 = errMsg.includes('502');
          const isCors = errMsg.includes('cors') || errMsg.includes('blocked') || errMsg.includes('preflight');
          const isNetwork = err instanceof TypeError || errMsg.includes('failed to fetch');
          if (is502 || isCors || isNetwork) {
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


