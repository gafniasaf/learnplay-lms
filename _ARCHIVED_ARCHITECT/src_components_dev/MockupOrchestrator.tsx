import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MAX_LANE_COUNT, buildLaneSpecs, LaneDiagnostics, LaneSpec } from '@/lib/mockupLanes';
import { ProductCriticFeedback, buildAutoTuneDirective } from '@/lib/mockupCritic';
import {
  Copy,
  RefreshCcw,
  PlayCircle,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Eye,
  Code,
  Maximize2,
  X,
  Download,
  Monitor,
  Tablet,
  Smartphone,
  Sparkles,
} from 'lucide-react';

export interface LaneSnapshot {
  id: string;
  title: string;
  html: string;
  diagnostics?: string[];
  url?: string | null;
  source?: 'provided' | 'generated';
}

type LaneStatus = 'pending' | 'rendering' | 'validating' | 'ready' | 'failed';

interface LaneState {
  spec: LaneSpec;
  status: LaneStatus;
  retries: number;
  logs: string[];
  html?: string;
  diagnostics?: string[];
  source?: 'provided' | 'generated';
}

interface LaneSummary {
  total: number;
  ready: number;
}

interface CritiqueLanePayload {
  id: string;
  title: string;
  instructions: string;
  validationHints: string[];
  html: string;
  source: 'generated' | 'provided';
  diagnostics: string[];
}

interface MockupOrchestratorProps {
  documentSource: string;
  artDirection?: string;
  planName?: string | null;
  onLanesChange?: (snapshots: LaneSnapshot[], summary: LaneSummary) => void;
}

const MAX_ATTEMPTS = 3;
const MAX_AUTO_TUNE_PASSES = 3;

const VIEWPORT_PRESETS = {
  mobile: { label: 'Mobile', width: 375, icon: Smartphone },
  tablet: { label: 'Tablet', width: 768, icon: Tablet },
  desktop: { label: 'Desktop', width: 1280, icon: Monitor },
  full: { label: 'Full', width: '100%' as const, icon: Maximize2 },
} as const;

type ViewportKey = keyof typeof VIEWPORT_PRESETS;

const VIEWPORT_STORAGE_KEY = 'ignitezero.mockup.viewport';
const MOCKUP_SNAPSHOT_BUCKET = import.meta.env.VITE_MOCKUP_BUCKET || 'mockups';

const slugifyMockupId = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeLaneTarget = (href: string) => {
  const sanitized = href
    .trim()
    .replace(/^(?:https?:)?\/\//, '')
    .replace(/\.html?$/i, '')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .split('#')[0];
  return slugifyMockupId(sanitized || href);
};

const statusConfig: Record<
  LaneStatus,
  { label: string; badge: 'default' | 'secondary' | 'destructive' | 'outline'; tone: string; icon: React.ElementType }
> = {
  pending: { label: 'Pending', badge: 'outline', tone: 'text-slate-500', icon: AlertCircle },
  rendering: { label: 'Rendering', badge: 'secondary', tone: 'text-cyan-400', icon: Loader2 },
  validating: { label: 'Validating', badge: 'secondary', tone: 'text-amber-400', icon: Loader2 },
  ready: { label: 'Ready', badge: 'default', tone: 'text-emerald-400', icon: CheckCircle2 },
  failed: { label: 'Failed', badge: 'destructive', tone: 'text-red-400', icon: AlertTriangle },
};

export function MockupOrchestrator({
  documentSource,
  artDirection,
  planName,
  onLanesChange,
}: MockupOrchestratorProps) {
  const [laneSpecs, setLaneSpecs] = useState<LaneSpec[]>([]);
  const [laneDiagnostics, setLaneDiagnostics] = useState<LaneDiagnostics | null>(null);
  const [specsLoading, setSpecsLoading] = useState(false);
  const [laneStates, setLaneStates] = useState<Record<string, LaneState>>({});
  const [laneOrder, setLaneOrder] = useState<string[]>([]);
  const [activeLaneId, setActiveLaneId] = useState<string | null>(null);
  const [runnerStatus, setRunnerStatus] = useState<'idle' | 'running'>('idle');
  const [previewTab, setPreviewTab] = useState<'preview' | 'code'>('preview');
  const [viewport, setViewport] = useState<ViewportKey>('desktop');
  const [fullscreenMode, setFullscreenMode] = useState(false);
  const [artDirectionChanged, setArtDirectionChanged] = useState(false);
  const [critiqueState, setCritiqueState] = useState<{
    status: 'idle' | 'loading' | 'ready' | 'error';
    data?: ProductCriticFeedback;
    error?: string;
  }>({ status: 'idle' });
  const [lastCritiqueSignature, setLastCritiqueSignature] = useState('');
  const [autoTuneEnabled, setAutoTuneEnabled] = useState(false);
  const [autoTunePass, setAutoTunePass] = useState(0);
  const [autoTunePendingReason, setAutoTunePendingReason] = useState('');
  const [snapshotMap, setSnapshotMap] = useState<Record<string, { url: string; html: string }>>({});

  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const fullscreenIframeRef = useRef<HTMLIFrameElement>(null);
  const artDirectionRef = useRef(artDirection);

  const bypassMockupHtml = (window as unknown as { __BYPASS_MOCKUP__?: string }).__BYPASS_MOCKUP__;
  const mergedDoc = useMemo(
    () => `${documentSource}\n\n${artDirection ? `## Art Direction\n${artDirection}` : ''}`.trim(),
    [artDirection, documentSource],
  );

  const planSlug = useMemo(() => slugifyMockupId(planName || 'mockup'), [planName]);

  useEffect(() => {
    if (artDirectionRef.current !== artDirection) {
      artDirectionRef.current = artDirection;
      if (laneOrder.length > 0) {
        setArtDirectionChanged(true);
      }
    }
  }, [artDirection, laneOrder.length]);

  useEffect(() => {
    const stored = localStorage.getItem(VIEWPORT_STORAGE_KEY);
    if (stored && stored in VIEWPORT_PRESETS) {
      setViewport(stored as ViewportKey);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(VIEWPORT_STORAGE_KEY, viewport);
  }, [viewport]);

  const persistSnapshot = useCallback(
    async (laneId: string, html: string) => {
      if (!planSlug || !html) return;
      try {
        const path = `${planSlug}/${laneId}.html`;
        const { error } = await supabase.storage
          .from(MOCKUP_SNAPSHOT_BUCKET)
          .upload(path, new Blob([html], { type: 'text/html' }), { upsert: true });
        if (error) {
          console.warn('[MockupOrchestrator] snapshot upload failed', error);
          return;
        }
        const { data: publicData } = supabase.storage.from(MOCKUP_SNAPSHOT_BUCKET).getPublicUrl(path);
        setSnapshotMap((prev) => ({ ...prev, [laneId]: { url: publicData?.publicUrl ?? '', html } }));
        console.info(`[MockupOrchestrator] Snapshot saved: ${laneId} → ${publicData?.publicUrl ?? 'local-only'}`);
      } catch (err) {
        console.warn('[MockupOrchestrator] snapshot persist error', err);
      }
    },
    [planSlug],
  );

  const restoreSnapshots = useCallback(() => {
    if (!Object.keys(snapshotMap).length) {
      console.info('[MockupOrchestrator] No snapshots available to restore.');
      return;
    }
    let restored = 0;
    Object.entries(snapshotMap).forEach(([laneId, snapshot]) => {
      const lane = laneStates[laneId];
      if (!lane || lane.html === snapshot.html) return;
      setLaneStates((prev) => ({
        ...prev,
        [laneId]: { ...prev[laneId], html: snapshot.html, status: 'ready' },
      }));
      restored++;
    });
    if (restored > 0) {
      toast.success(`Reverted ${restored} lane(s) to last approved snapshot.`);
      console.info(`[MockupOrchestrator] Reverted to snapshots: ${restored} lanes`);
    }
  }, [laneStates, snapshotMap]);

  const triggerAutoTune = useCallback(
    (reason: string) => {
      const sanitized = reason.trim();
      if (!sanitized) return;
      setAutoTunePendingReason(sanitized);
      console.info(`[MockupOrchestrator] Queueing auto-tune directive: ${sanitized.slice(0, 80)}…`);
    },
    [],
  );


  useEffect(() => {
    if (!documentSource) return;
    setSpecsLoading(true);
    buildLaneSpecs(documentSource, supabase.functions.invoke.bind(supabase.functions))
      .then(({ lanes, diagnostics }) => {
        setLaneSpecs(lanes);
        setLaneDiagnostics(diagnostics);
        setSpecsLoading(false);
      })
      .catch((err) => {
        console.error('[MockupOrchestrator] buildLaneSpecs failed', err);
        toast.error('Failed to analyze document structure.');
        setSpecsLoading(false);
      });
  }, [documentSource]);

  useEffect(() => {
    if (!laneSpecs.length) return;
    const newStates: Record<string, LaneState> = {};
    const newOrder: string[] = [];
    laneSpecs.forEach((spec) => {
      newStates[spec.id] = {
        spec,
        status: spec.providedHtml ? 'ready' : 'pending',
        retries: 0,
        logs: [],
        html: spec.providedHtml,
        source: spec.providedHtml ? 'provided' : undefined,
      };
      newOrder.push(spec.id);
    });
    setLaneStates(newStates);
    setLaneOrder(newOrder);
    if (newOrder.length > 0) {
      setActiveLaneId(newOrder[0]);
    }
  }, [laneSpecs]);

  const updateLane = useCallback((laneId: string, updater: (current: LaneState) => Partial<LaneState>) => {
    setLaneStates((prev) => {
      const current = prev[laneId];
      if (!current) return prev;
      return { ...prev, [laneId]: { ...current, ...updater(current) } };
    });
  }, []);

  const runLane = useCallback(
    async (laneId: string) => {
      const lane = laneStates[laneId];
      if (!lane) return;
      if (lane.source === 'provided') {
        updateLane(laneId, () => ({ status: 'ready' }));
        return;
      }
      if (bypassMockupHtml) {
        updateLane(laneId, () => ({
          status: 'ready',
          html: '<html><body><h1>Bypass Mode</h1></body></html>',
          source: 'generated',
        }));
        return;
      }

      updateLane(laneId, () => ({ status: 'rendering' }));

      try {
        const otherLanes = laneOrder
          .filter((id) => id !== laneId)
          .map((id) => ({ id, title: laneStates[id]?.spec.title ?? id }));

        const { data, error } = await supabase.functions.invoke('architect-advisor', {
          body: {
            mode: 'mockup-lane',
            prompt: mergedDoc,
            laneId,
            pageSpec: lane.spec.instructions,
            validationHints: lane.spec.validationHints,
            otherLanes,
          },
        });

        if (error) {
          const message = error.message || String(error);
          const isRetryable = /network|timeout|50[0-9]/.test(message.toLowerCase());
          if (isRetryable && lane.retries < MAX_ATTEMPTS) {
            updateLane(laneId, (current) => ({
              status: 'pending',
              retries: current.retries + 1,
              logs: [...current.logs, `Retry ${current.retries + 1}: ${message}`],
            }));
            await new Promise((resolve) => setTimeout(resolve, 1000 * (lane.retries + 1)));
            return runLane(laneId);
          }
          throw new Error(message);
        }

        const parsed = typeof data?.result === 'string' ? JSON.parse(data.result) : data?.result;
        const html = parsed?.html ?? '';
        if (!html) throw new Error('No HTML returned from architect-advisor');

        updateLane(laneId, () => ({
          status: 'ready',
          html,
          source: 'generated',
          diagnostics: parsed?.diagnostics ?? [],
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[MockupOrchestrator] Lane ${laneId} failed:`, message);
        updateLane(laneId, (current) => ({
          status: 'failed',
          logs: [...current.logs, `Error: ${message}`],
        }));
        toast.error(`Lane "${lane.spec.title}" failed: ${message.slice(0, 60)}…`);
      }
    },
    [bypassMockupHtml, laneOrder, laneStates, mergedDoc, updateLane],
  );

  const runAutoTunePass = useCallback(
    async (passNumber: number, reason: string) => {
      console.info(`[MockupOrchestrator] Pass ${passNumber} starting. Reason: ${reason.slice(0, 100)}…`);
      setAutoTunePass(passNumber);
      const directive = reason;
      laneOrder.forEach((laneId) => {
        const lane = laneStates[laneId];
        if (!lane || lane.source === 'provided') return;
        setLaneStates((prev) => ({
          ...prev,
          [laneId]: {
            ...prev[laneId],
            status: 'pending',
            html: undefined,
            spec: {
              ...prev[laneId].spec,
              instructions: `${prev[laneId].spec.instructions}\n\n${directive}`,
            },
          },
        }));
      });
      setRunnerStatus('running');
      try {
        for (const laneId of laneOrder) {
          const lane = laneStates[laneId];
          if (!lane || lane.source === 'provided') continue;
          await runLane(laneId);
        }
      } finally {
        setRunnerStatus('idle');
      }
      console.info(`[MockupOrchestrator] Pass ${passNumber} completed.`);
    },
    [laneOrder, laneStates, runLane],
  );

  useEffect(() => {
    if (!autoTunePendingReason || !autoTuneEnabled) return;
    if (runnerStatus === 'running') return;
    if (autoTunePass >= MAX_AUTO_TUNE_PASSES) {
      console.warn(`[MockupOrchestrator] Reached pass limit (${MAX_AUTO_TUNE_PASSES}). Reason: ${autoTunePendingReason.slice(0, 80)}…`);
      restoreSnapshots();
      setAutoTunePendingReason('');
      return;
    }
    const nextPass = autoTunePass + 1;
    runAutoTunePass(nextPass, autoTunePendingReason);
    setAutoTunePendingReason('');
  }, [autoTuneEnabled, autoTunePass, autoTunePendingReason, restoreSnapshots, runAutoTunePass, runnerStatus]);

  const laneList = useMemo(
    () => laneOrder.map((id) => ({ id, state: laneStates[id] })).filter(({ state }) => !!state),
    [laneOrder, laneStates],
  );

  const laneSlugMap = useMemo(() => {
    const map: Record<string, string> = {};
    laneList.forEach(({ id, state }) => {
      if (!state) return;
      const slug = slugifyMockupId(state.spec.title);
      map[slug] = id;
      map[id] = id;
    });
    return map;
  }, [laneList]);

  const attachLinkHijacker = useCallback(
    (iframe: HTMLIFrameElement) => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const anchors = doc.querySelectorAll('a[href]');
      anchors.forEach((anchor) => {
        const rawHref = anchor.getAttribute('href');
        if (!rawHref) return;
        if (/^(?:https?:|mailto:|tel:)/i.test(rawHref)) return;
        const htmlAnchor = anchor as HTMLAnchorElement;
        if (htmlAnchor.dataset.mockupHijacked === 'true') return;
        const targetSlug = normalizeLaneTarget(rawHref);
        const targetLaneId = laneSlugMap[targetSlug];
        if (!targetLaneId) return;
        htmlAnchor.dataset.mockupHijacked = 'true';
        htmlAnchor.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (targetLaneId === activeLaneId) return;
          setActiveLaneId(targetLaneId);
          setPreviewTab('preview');
        });
      });
    },
    [activeLaneId, laneSlugMap],
  );

  const readySnapshots: LaneSnapshot[] = useMemo(
    () =>
      laneList
        .filter(({ state }) => state?.status === 'ready' && state.html)
        .map(({ id, state }) => ({
          id,
          title: state?.spec.title ?? id,
          html: state?.html ?? '',
          diagnostics: state?.diagnostics,
          source: state?.source ?? (state?.spec.providedHtml ? 'provided' : 'generated'),
        })),
    [laneList],
  );

  useEffect(() => {
    onLanesChange?.(readySnapshots, {
      total: laneOrder.length,
      ready: readySnapshots.length,
    });
  }, [laneOrder.length, onLanesChange, readySnapshots]);

  useEffect(() => {
    if (critiqueState.status !== 'ready' || critiqueState.data?.verdict !== 'approved') {
      return;
    }
    readySnapshots.forEach((snapshot) => {
      if (!snapshot.html) return;
      const existing = snapshotMap[snapshot.id];
      if (existing?.html === snapshot.html) return;
      persistSnapshot(snapshot.id, snapshot.html);
    });
  }, [critiqueState.data?.verdict, critiqueState.status, persistSnapshot, readySnapshots, snapshotMap]);

  const progressPct = laneOrder.length ? Math.round((readySnapshots.length / laneOrder.length) * 100) : 0;

  const activeLane = activeLaneId ? laneStates[activeLaneId] : undefined;
  const previewViewportStyle = useMemo(() => {
    const preset = VIEWPORT_PRESETS[viewport];
    if (!preset) return { width: '100%', maxWidth: '100%' };
    if (preset.width === '100%') {
      return { width: '100%', maxWidth: '100%' };
    }
    return { width: `${preset.width}px`, maxWidth: '100%' };
  }, [viewport]);
  const activeLaneHtml = activeLane?.html ?? '';

  useEffect(() => {
    if (previewTab !== 'preview') return;
    const iframe = previewIframeRef.current;
    if (!iframe) return;
    const handleLoad = () => attachLinkHijacker(iframe);
    iframe.addEventListener('load', handleLoad);
    if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
      attachLinkHijacker(iframe);
    }
    return () => {
      iframe.removeEventListener('load', handleLoad);
    };
  }, [attachLinkHijacker, activeLaneHtml, previewTab, viewport]);

  useEffect(() => {
    if (!fullscreenMode) return;
    const iframe = fullscreenIframeRef.current;
    if (!iframe) return;
    const handleLoad = () => attachLinkHijacker(iframe);
    iframe.addEventListener('load', handleLoad);
    if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
      attachLinkHijacker(iframe);
    }
    return () => {
      iframe.removeEventListener('load', handleLoad);
    };
  }, [attachLinkHijacker, activeLaneHtml, fullscreenMode, viewport]);

  const critiqueSignature = useMemo(
    () =>
      readySnapshots
        .map((snapshot) => `${snapshot.id}:${snapshot.html.length}:${snapshot.source ?? 'generated'}`)
        .join('|'),
    [readySnapshots],
  );

  const fetchCritique = useCallback(
    async (signature: string) => {
      const lanePayload: CritiqueLanePayload[] = laneOrder
        .map((id) => {
          const lane = laneStates[id];
          if (!lane) return null;
          const rawHtml = lane.html ?? lane.spec.providedHtml ?? '';
          return {
            id,
            title: lane.spec.title,
            instructions: lane.spec.instructions,
            validationHints: lane.spec.validationHints,
            html: typeof rawHtml === 'string' ? rawHtml.slice(0, 15000) : '',
            source: lane.source ?? (lane.spec.providedHtml ? 'provided' : 'generated'),
            diagnostics: lane.diagnostics ?? [],
          };
        })
        .filter((lane): lane is CritiqueLanePayload => lane !== null);

      if (!lanePayload.length) return;

      setCritiqueState({ status: 'loading' });
      try {
        const { data, error } = await supabase.functions.invoke('architect-advisor', {
          body: {
            mode: 'mockup-critique',
            prompt: mergedDoc,
            context: {
              artDirection: artDirection ?? '',
              planName: planName ?? null,
            },
            lanes: lanePayload,
          },
        });

        if (error) {
          throw new Error(error.message);
        }

        const raw = typeof data?.result === 'string' ? JSON.parse(data.result) : data?.result;
        const sanitizeList = (value: unknown) =>
          Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, 5) : [];

        const normalized: ProductCriticFeedback = {
          verdict: raw?.verdict === 'approved' ? 'approved' : 'needs_revision',
          missingScreens: sanitizeList(raw?.missing_screens),
          redundantScreens: sanitizeList(raw?.redundant_screens),
          journeyIssues: sanitizeList(raw?.journey_issues),
          suggestions: sanitizeList(raw?.suggestions),
        };

        if (
          normalized.verdict === 'approved' &&
          (normalized.missingScreens.length > 0 || normalized.journeyIssues.length > 0)
        ) {
          normalized.verdict = 'needs_revision';
        }

        setCritiqueState({ status: 'ready', data: normalized });
        setLastCritiqueSignature(signature);

        if (normalized.verdict === 'needs_revision') {
          const directive = buildAutoTuneDirective(normalized);
          if (autoTuneEnabled && autoTunePass < MAX_AUTO_TUNE_PASSES && directive) {
            triggerAutoTune(directive);
          } else if (directive) {
            toast.warning(`Product Critic feedback: ${directive.split('\n')[0]}`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[MockupOrchestrator] mockup-critique failed', err);
        setCritiqueState({ status: 'error', error: message });
      }
    },
    [artDirection, autoTuneEnabled, autoTunePass, laneOrder, laneStates, mergedDoc, planName, triggerAutoTune],
  );

  useEffect(() => {
    if (!laneOrder.length || readySnapshots.length === 0) {
      if (critiqueState.status !== 'idle') {
        setCritiqueState({ status: 'idle' });
      }
      return;
    }
    if (readySnapshots.length !== laneOrder.length) return;
    if (runnerStatus === 'running') return;
    if (!critiqueSignature || critiqueSignature === lastCritiqueSignature) return;
    fetchCritique(critiqueSignature);
  }, [
    critiqueSignature,
    critiqueState.status,
    fetchCritique,
    laneOrder.length,
    lastCritiqueSignature,
    readySnapshots.length,
    runnerStatus,
  ]);

  const runAllLanes = useCallback(async () => {
    if (!laneOrder.length) {
      toast.error('No lanes detected in the document.');
      return;
    }
    if (runnerStatus === 'running') return;
    setRunnerStatus('running');
    setArtDirectionChanged(false);
    try {
      for (const laneId of laneOrder) {
        const lane = laneStates[laneId];
        if (!lane || lane.status === 'ready') continue;
        await runLane(laneId);
      }
    } finally {
      setRunnerStatus('idle');
    }
  }, [laneOrder, laneStates, runLane, runnerStatus]);

  const bypassAutoRunRef = useRef(false);
  useEffect(() => {
    if (!bypassMockupHtml || bypassAutoRunRef.current || !laneOrder.length) return;
    bypassAutoRunRef.current = true;
    runAllLanes();
  }, [bypassMockupHtml, laneOrder.length, runAllLanes]);

  const regenerateAllLanes = useCallback(async () => {
    if (!laneOrder.length) {
      toast.error('No lanes to regenerate.');
      return;
    }
    if (runnerStatus === 'running') return;
    setRunnerStatus('running');
    setArtDirectionChanged(false);

    laneOrder.forEach((laneId) => {
      updateLane(laneId, (current) => ({
        ...current,
        status: current.source === 'provided' ? 'ready' : 'pending',
        html: current.source === 'provided' ? current.html : undefined,
      }));
    });

    try {
      for (const laneId of laneOrder) {
        const lane = laneStates[laneId];
        if (!lane || lane.source === 'provided') continue;
        await runLane(laneId);
      }
      toast.success('Mockups regenerated with new art direction.');
    } finally {
      setRunnerStatus('idle');
    }
  }, [laneOrder, laneStates, runLane, runnerStatus, updateLane]);

  const resumePending = useCallback(async () => {
    if (runnerStatus === 'running') return;
    const remaining = laneOrder.filter((id) => laneStates[id]?.status !== 'ready');
    if (!remaining.length) {
      toast.message('All lanes already ready.');
      return;
    }
    setRunnerStatus('running');
    try {
      for (const laneId of remaining) {
        await runLane(laneId);
      }
    } finally {
      setRunnerStatus('idle');
    }
  }, [laneOrder, laneStates, runLane, runnerStatus]);

  const copyActiveHtml = useCallback(async () => {
    if (!activeLane?.html) {
      toast.error('Generate a lane before copying.');
      return;
    }
    await navigator.clipboard.writeText(activeLane.html);
    toast.success('HTML copied to clipboard');
  }, [activeLane]);

  const downloadActiveHtml = useCallback(() => {
    if (!activeLane?.html) {
      toast.error('Generate a lane before downloading.');
      return;
    }
    const blob = new Blob([activeLane.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${planName || 'mockup'}-${activeLane.spec.id}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [activeLane, planName]);

  const hasPending = laneOrder.some((id) => laneStates[id]?.status !== 'ready');

  // Fullscreen Mode
  if (fullscreenMode) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex">
        {/* Sidebar */}
        <div className="w-80 border-r border-slate-800 bg-slate-900/50 backdrop-blur flex flex-col">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Mockup Gallery</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {readySnapshots.length} / {laneOrder.length} ready
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setFullscreenMode(false)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {laneList.map(({ id, state }) => {
                if (!state) return null;
                const config = statusConfig[state.status];
                const Icon = config.icon;
                const isActive = activeLaneId === id;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      setActiveLaneId(id);
                      setPreviewTab('preview');
                    }}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition group ${
                      isActive
                        ? 'border-emerald-400/60 bg-emerald-400/10'
                        : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium ${isActive ? 'text-emerald-200' : 'text-slate-200'}`}>
                        {state.spec.title}
                      </p>
                      <Icon
                        className={`h-3.5 w-3.5 flex-shrink-0 ${state.status === 'rendering' || state.status === 'validating' ? 'animate-spin' : ''} ${config.tone}`}
                      />
                    </div>
                    <Badge variant={config.badge} className="text-[10px] mt-1.5">
                      {config.label}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Main Preview Area */}
        <div className="flex-1 flex flex-col">
          <div className="p-4 border-b border-slate-800 bg-slate-900/30 backdrop-blur flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-xs font-mono">
                {activeLane?.spec.title ?? 'Select a lane'}
              </Badge>
              {activeLane?.status && (
                <span className={`text-xs font-medium ${statusConfig[activeLane.status].tone}`}>
                  {statusConfig[activeLane.status].label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {Object.entries(VIEWPORT_PRESETS).map(([key, preset]) => {
                const Icon = preset.icon;
                const isActive = viewport === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setViewport(key as ViewportKey)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition flex items-center gap-1.5 ${
                      isActive
                        ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                        : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyActiveHtml} disabled={!activeLane?.html}>
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy
              </Button>
              <Button variant="outline" size="sm" onClick={downloadActiveHtml} disabled={!activeLane?.html}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download
              </Button>
            </div>
          </div>
          <div className="flex-1 bg-slate-950 p-6 overflow-auto flex justify-center items-start">
            {activeLane?.html ? (
              <div className="w-full flex justify-center">
                <div className="transition-all duration-300" style={previewViewportStyle}>
                  <iframe
                    ref={fullscreenIframeRef}
                    title="Fullscreen preview"
                    srcDoc={activeLane.html}
                    sandbox="allow-same-origin"
                    className="w-full min-h-[800px] rounded-lg bg-white shadow-2xl border border-slate-800"
                  />
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                <Eye className="h-12 w-12 opacity-20" />
                <p className="text-sm">Select a lane to preview</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main Orchestrator UI
  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card className="border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-slate-950" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">Blueprint Mockup Orchestrator</h3>
                  <p className="text-sm text-slate-400">Pixel-perfect HTML for every core experience</p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    {readySnapshots.length} / {laneOrder.length || 0} lanes ready
                  </span>
                  <span className="text-emerald-400 font-medium">{progressPct}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 transition-all duration-500 rounded-full"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Warnings */}
              {specsLoading && (
                <div className="flex items-center gap-2 text-xs text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 rounded-lg px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Analyzing document structure...</span>
                </div>
              )}
              {laneDiagnostics && (laneDiagnostics.truncatedCount > 0 || laneDiagnostics.skippedHeadings.length > 0) && (
                <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>
                    {laneDiagnostics.truncatedCount > 0 &&
                      `${laneDiagnostics.truncatedCount} sections trimmed (max ${MAX_LANE_COUNT}). `}
                    {laneDiagnostics.skippedHeadings.length > 0 &&
                      `${laneDiagnostics.skippedHeadings.length} non-UI sections ignored.`}
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              {artDirectionChanged && (
                <Button
                  onClick={regenerateAllLanes}
                  disabled={runnerStatus === 'running'}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                >
                  {runnerStatus === 'running' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <RefreshCcw className="h-4 w-4 mr-2" />
                      Apply New Art Direction
                    </>
                  )}
                </Button>
              )}
              <Button
                onClick={runAllLanes}
                disabled={runnerStatus === 'running' || !laneOrder.length}
                className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600"
              >
                {runnerStatus === 'running' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Rendering {readySnapshots.length}/{laneOrder.length}
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Generate All Mockups
                  </>
                )}
              </Button>
              {hasPending && (
                <Button variant="outline" onClick={resumePending} disabled={runnerStatus === 'running'} size="sm">
                  Resume Pending
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lane Grid + Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lane List */}
        <Card className="border-slate-800 bg-slate-950 lg:col-span-1">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-200">Mockup Lanes</h4>
              <Badge variant="outline" className="text-xs">
                {laneOrder.length}
              </Badge>
            </div>
            <ScrollArea className="h-[600px]">
              <div className="space-y-2 pr-3">
                {laneList.map(({ id, state }) => {
                  if (!state) return null;
                  const config = statusConfig[state.status];
                  const Icon = config.icon;
                  const isActive = activeLaneId === id;
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setActiveLaneId(id);
                        setPreviewTab('preview');
                      }}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left transition group ${
                        isActive
                          ? 'border-emerald-400/60 bg-emerald-400/10'
                          : 'border-slate-800 bg-slate-900/30 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className={`text-sm font-medium leading-tight ${isActive ? 'text-emerald-200' : 'text-slate-200'}`}>
                          {state.spec.title}
                        </p>
                        <Icon
                          className={`h-3.5 w-3.5 flex-shrink-0 ${state.status === 'rendering' || state.status === 'validating' ? 'animate-spin' : ''} ${config.tone}`}
                        />
                      </div>
                      <Badge variant={config.badge} className="text-[10px]">
                        {config.label}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Preview Panel */}
        <Card className="border-slate-800 bg-slate-950 lg:col-span-2">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-slate-200">
                  {activeLane?.spec.title ?? 'No Lane Selected'}
                </h4>
                {activeLane?.status && (
                  <Badge variant={statusConfig[activeLane.status].badge} className="text-[10px]">
                    {statusConfig[activeLane.status].label}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex border border-slate-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setPreviewTab('preview')}
                    className={`px-3 py-1 text-xs font-medium transition ${
                      previewTab === 'preview'
                        ? 'bg-emerald-400/10 text-emerald-300'
                        : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <Eye className="h-3 w-3 inline mr-1" />
                    Preview
                  </button>
                  <button
                    onClick={() => setPreviewTab('code')}
                    className={`px-3 py-1 text-xs font-medium transition ${
                      previewTab === 'code'
                        ? 'bg-emerald-400/10 text-emerald-300'
                        : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <Code className="h-3 w-3 inline mr-1" />
                    Code
                  </button>
                </div>
                <Button variant="outline" size="sm" onClick={() => setFullscreenMode(true)} disabled={!activeLane?.html}>
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Viewport Selector */}
            {previewTab === 'preview' && (
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-800">
                {Object.entries(VIEWPORT_PRESETS).map(([key, preset]) => {
                  const Icon = preset.icon;
                  const isActive = viewport === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setViewport(key as ViewportKey)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition flex items-center gap-1.5 ${
                        isActive
                          ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                          : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Preview/Code Content */}
            <div className="bg-slate-900/50 rounded-lg border border-slate-800 overflow-hidden">
              {previewTab === 'preview' ? (
                activeLane?.html ? (
                  <div className="p-4 flex justify-center bg-slate-900">
                    <div className="transition-all duration-300" style={previewViewportStyle}>
                      <iframe
                        ref={previewIframeRef}
                        title="Lane preview"
                        srcDoc={activeLane.html}
                        sandbox="allow-same-origin"
                        className="w-full min-h-[500px] rounded-lg bg-white shadow-lg border border-slate-700"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="h-[500px] flex flex-col items-center justify-center text-slate-500 gap-2">
                    <Eye className="h-12 w-12 opacity-20" />
                    <p className="text-sm">
                      {activeLane ? 'Click "Generate All Mockups" to render' : 'Select a lane to preview'}
                    </p>
                  </div>
                )
              ) : activeLane?.html ? (
                <ScrollArea className="h-[500px]">
                  <pre className="p-4 text-xs text-slate-300 font-mono leading-relaxed">{activeLane.html}</pre>
                </ScrollArea>
              ) : (
                <div className="h-[500px] flex flex-col items-center justify-center text-slate-500 gap-2">
                  <Code className="h-12 w-12 opacity-20" />
                  <p className="text-sm">No code available</p>
                </div>
              )}
            </div>

            {/* Actions */}
            {activeLane?.html && (
              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" onClick={copyActiveHtml} className="flex-1">
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy HTML
                </Button>
                <Button variant="outline" size="sm" onClick={downloadActiveHtml} className="flex-1">
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Product Critic Panel */}
      {critiqueState.status !== 'idle' && (
        <Card className="border-slate-800 bg-slate-950">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-slate-200">Product Critic Review</h4>
                {critiqueState.status === 'loading' && <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoTuneEnabled}
                    onChange={(e) => setAutoTuneEnabled(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                  />
                  Auto-Tune
                </label>
                {autoTunePass > 0 && (
                  <Badge variant="outline" className="text-xs">
                    Pass {autoTunePass}/{MAX_AUTO_TUNE_PASSES}
                  </Badge>
                )}
              </div>
            </div>

            {critiqueState.status === 'ready' && critiqueState.data && (
              <div className="space-y-3">
                <div
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${
                    critiqueState.data.verdict === 'approved'
                      ? 'border-emerald-400/40 text-emerald-300 bg-emerald-400/10'
                      : 'border-amber-400/40 text-amber-300 bg-amber-500/10'
                  }`}
                >
                  {critiqueState.data.verdict === 'approved' ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approved
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3.5 w-3.5" />
                      Needs Revision
                    </>
                  )}
                </div>

                {critiqueState.data.verdict === 'needs_revision' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {critiqueState.data.missingScreens.length > 0 && (
                      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
                        <p className="text-xs font-semibold text-slate-300 mb-2">Missing Screens</p>
                        <ul className="list-disc list-inside text-xs text-slate-400 space-y-1">
                          {critiqueState.data.missingScreens.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {critiqueState.data.journeyIssues.length > 0 && (
                      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
                        <p className="text-xs font-semibold text-slate-300 mb-2">Journey Issues</p>
                        <ul className="list-disc list-inside text-xs text-slate-400 space-y-1">
                          {critiqueState.data.journeyIssues.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {critiqueState.data.redundantScreens.length > 0 && (
                      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
                        <p className="text-xs font-semibold text-slate-300 mb-2">Redundant Screens</p>
                        <ul className="list-disc list-inside text-xs text-slate-400 space-y-1">
                          {critiqueState.data.redundantScreens.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {critiqueState.data.suggestions.length > 0 && (
                      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
                        <p className="text-xs font-semibold text-slate-300 mb-2">Suggestions</p>
                        <ul className="list-disc list-inside text-xs text-slate-400 space-y-1">
                          {critiqueState.data.suggestions.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {critiqueState.status === 'error' && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{critiqueState.error}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
