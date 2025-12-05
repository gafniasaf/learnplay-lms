import { useEffect, useMemo, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, RefreshCcw } from 'lucide-react';
import type manifest from '../../../system-manifest.json';
import { manifestToMermaid } from '@/lib/manifestGraph';
import { toast } from 'sonner';

type SystemManifest = typeof manifest;

interface BlueprintVisualizerProps {
  manifest: SystemManifest;
}

const initMermaid = (() => {
  let initialized = false;
  return () => {
    if (initialized) return;
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        primaryColor: '#0f172a',
        primaryBorderColor: '#34d399',
        lineColor: '#34d399',
        textColor: '#e2e8f0',
        secondaryColor: '#1e293b',
        tertiaryColor: '#111827',
      },
    });
    initialized = true;
  };
})();

export const BlueprintVisualizer = ({ manifest }: BlueprintVisualizerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const graph = useMemo(
    () => manifestToMermaid(manifest, { title: manifest.system?.name }),
    [manifest],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    initMermaid();

    let cancelled = false;
    setLoading(true);
    setError(null);

    const render = async () => {
      try {
        const id = `blueprint-${Date.now()}`;
        const { svg: rendered } = await mermaid.render(id, graph);
        if (cancelled) return;
        setSvg(rendered);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [graph, refreshKey]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(graph);
      toast.success('Mermaid definition copied');
    } catch (err) {
      toast.error(
        `Unable to copy: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  return (
    <Card className="bg-slate-950 border-slate-800">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-emerald-300 font-mono text-lg">
            Blueprint Map
          </CardTitle>
          <p className="text-sm text-slate-400">
            Live diagram generated from <code>system-manifest.json</code>.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="h-3.5 w-3.5 mr-2" />
            Copy Graph
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setRefreshKey((key) => key + 1)}
          >
            <RefreshCcw className="h-3.5 w-3.5 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
        {loading && (
          <div className="text-center text-sm text-slate-400 py-20">
            Rendering diagram...
          </div>
        )}
        {error && (
          <div className="text-center text-sm text-amber-300 py-10 space-y-2">
            <p>Unable to render blueprint.</p>
            <p className="font-mono">{error}</p>
          </div>
        )}
        {!loading && !error && (
          <div
            ref={containerRef}
            className="overflow-auto [&amp;>svg]:mx-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
        <div className="mt-4 text-xs text-slate-500 flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] border-slate-700">
            Manifest-driven
          </Badge>
          <span>
            Jobs render as hex nodes, entities as subgraphs. Update the manifest
            to change the map.
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default BlueprintVisualizer;


