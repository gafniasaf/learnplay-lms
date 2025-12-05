import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Copy,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sparkles,
  Lightbulb,
  Map,
  Bot,
  Rocket,
  Dice5,
  ChevronDown,
  ChevronUp,
  History,
  Eye,
  Code,
  Download,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { ensureSessionSlug, rotateSessionSlug, writeSessionSlug } from '@/lib/session';

interface Analysis {
  summary: string;
  pros: string[];
  cons: string[];
}

interface DecodedStep {
  id: number;
  title: string;
  description: string;
  cursor_prompt: string;
}

interface DecodedPlan {
  project_name: string;
  analysis?: Analysis;
  architecture_pivot?: string; 
  steps: DecodedStep[];
  markdown_plan?: string;
}

const RANDOM_IDEAS = [
  "A 'Tinder for Adoptable Cats' connected to local shelters.",
  "A CRM for Window Cleaners to schedule jobs and send invoices.",
  "A Digital Garden where my notes grow into trees based on how much I edit them.",
  "A Smart Grocery List that auto-generates recipes based on what I buy.",
  "I want a system for a Dog Walking business that tracks appointments and dog profiles.",
];

import { ConsultantChat } from './ConsultantChat';
import { MockupOrchestrator, LaneSnapshot } from './MockupOrchestrator';

interface UploadedMockup {
  laneId: string;
  url: string;
}

const STEP_PATTERNS = {
  core: /(genesis|infra|foundation|core)/i,
  logic: /(helper|strategy|integration|job|orchestrator|engine|pipeline|automation)/i,
  ui: /(ui|view|shell|component|dashboard|page)/i,
};

const TEAM_MANUAL_URL =
  'https://github.com/gafniasaf/project-genesis/blob/main/docs/TeamManual.md';
const DEFAULT_MOCKUP_GUIDANCE =
  'Create a single-page mockup (hero, features, and CTA) with neutral fonts, subtle gradients, and labels that match the plan.';
const MOCKUP_STANDARD_COPY = `IGNITE MOCKUP SPEC
- Sections: Hero, Pillars/Features, Credibility strip, CTA footer
- Typography: Bold display headline, mono labels, body width ≤ 600px
- Palette: Slate-950 canvas, emerald→cyan gradient primary, optional amber accent
- Copy: Use manifest nouns (Campaign, Brief, Cadet). No lorem ipsum.
- Layout: ≥32px gutters, cards with border-slate-800, hover scale ≤ 1.01, CTA ≥ 56px height`;
const MOCKUP_SPEC_LINES = MOCKUP_STANDARD_COPY.split('\n');

const sanitizeName = (value?: string) =>
  (value || 'ignite-plan')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'ignite-plan';

const formatVersionLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatStep = (step: DecodedStep) => {
  const desc = step.description ? step.description.trim() : '';
  const command = step.cursor_prompt
    ? `\n  - Command: ${step.cursor_prompt}`
    : '';
  return `- [ ] **${step.title}:** ${desc || 'Define this workstream.'}${command}`;
};

const categorizeSteps = (steps: DecodedStep[]) => {
  const groups = {
    core: [] as DecodedStep[],
    logic: [] as DecodedStep[],
    ui: [] as DecodedStep[],
    misc: [] as DecodedStep[],
  };

  steps.forEach((step) => {
    if (STEP_PATTERNS.core.test(step.title)) {
      groups.core.push(step);
    } else if (STEP_PATTERNS.logic.test(step.title)) {
      groups.logic.push(step);
    } else if (STEP_PATTERNS.ui.test(step.title)) {
      groups.ui.push(step);
    } else {
      groups.misc.push(step);
    }
  });

  return groups;
};

const generatePlanMarkdown = (plan: DecodedPlan) => {
  const sections: string[] = [];
  sections.push(`# Ignite Execution Plan: ${plan.project_name || 'Untitled System'}`);

  if (plan.analysis?.summary) {
    sections.push(`> ${plan.analysis.summary}`);
  }

  if (!plan.steps || plan.steps.length === 0) {
    return (plan.markdown_plan || sections.join('\n\n')).trim();
  }

  const groups = categorizeSteps(plan.steps);
  const addSection = (title: string, steps: DecodedStep[]) => {
    if (!steps.length) return;
    sections.push(`## ${title}\n${steps.map(formatStep).join('\n')}`);
  };

  addSection('Phase 1: The Core', groups.core);
  addSection('Phase 2: The Logic', groups.logic);
  addSection('Phase 3: The UI', groups.ui);
  addSection('Additional Workstreams', groups.misc);

  return sections.join('\n\n').trim();
};

export function SystemGenesisV2() {
  console.log('System Genesis V2 (Platinum) Loaded');
  const { user } = useAuth();
  const [sessionSlug, setSessionSlug] = useState(() => ensureSessionSlug());
  useEffect(() => {
    writeSessionSlug(sessionSlug);
  }, [sessionSlug]);
  const [input, setInput] = useState('');
  const [plan, setPlan] = useState<DecodedPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [planDownloaded, setPlanDownloaded] = useState(false);
  const [consultantMode, setConsultantMode] = useState<'plan' | 'mockup' | null>(null);
  const [refinements, setRefinements] = useState<string[]>([]);
  const [discoveryNotes, setDiscoveryNotes] = useState<string | null>(null);
  const [planLink, setPlanLink] = useState<string | null>(null);
  const [uploadingPlan, setUploadingPlan] = useState(false);
  const [bucketHealthy, setBucketHealthy] = useState(true);
  const [bucketChecked, setBucketChecked] = useState(false);
  const [mockupApproved, setMockupApproved] = useState(false);
  const [mockupBrief, setMockupBrief] = useState('');
  const [laneSnapshots, setLaneSnapshots] = useState<LaneSnapshot[]>([]);
  const [laneSummary, setLaneSummary] = useState({ total: 0, ready: 0 });

  const sanitizedPlanName = useMemo(
    () => sanitizeName(plan?.project_name),
    [plan?.project_name],
  );

  const runDecode = async (promptText: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('architect-advisor', {
        body: {
          prompt: promptText,
          mode: 'decode',
          ownerId: user?.id,
          sessionId: sessionSlug,
        },
      });
      
      if (error) {
        toast.error(`Decode failed: ${error.message}`);
        return;
      }
      
      const parsed = typeof data?.result === 'string' ? JSON.parse(data.result) : data?.result;
      setPlan(parsed);
      setWizardStep(1);
      setPlanDownloaded(false);
    } catch (err: any) {
      toast.error(`Exception: ${err?.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const decode = () => {
    // Clear previous refinements on fresh start
    setRefinements([]);
    setDiscoveryNotes(null);
    runDecode(input);
  };





  const copyMockupSpec = () => {
    navigator.clipboard.writeText(MOCKUP_STANDARD_COPY);
    toast.success('Mockup spec copied');
  };





  const handleMockupBriefFromConsultant = (brief: string) => {
    setMockupBrief(brief);
    setConsultantMode(null);
    toast.success('Mockup brief updated. Click "Apply New Art Direction" in the orchestrator to regenerate.');
  };

  const handleRefinedPrompt = (newRefinement: string) => {
    const updatedRefinements = [...refinements, newRefinement];
    setRefinements(updatedRefinements);
    setDiscoveryNotes(newRefinement);
    
    const compositePrompt = `ORIGINAL GOAL: ${input}

HISTORY OF REFINEMENTS:
${updatedRefinements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

CURRENT PLAN CONTEXT:
${JSON.stringify(plan, null, 2)}

TASK: Regenerate the Ignite Zero Plan. Merge the ALL refinement instructions into the original goal. Keep what works, change what needs changing based on the feedback. Output the full updated plan JSON.`;

    setConsultantMode(null);
    setTimeout(() => {
      runDecode(compositePrompt);
    }, 100);
  };

  const getDiscoveryLines = (notes: string) =>
    notes
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

  const formatDiscoveryNotes = (notes: string) => {
    const lines = getDiscoveryLines(notes);
    if (lines.length === 0) return '';
    const bullets = lines.map((line) => `- ${line}`).join('\n');
    return `## Discovery Notes\n${bullets}`;
  };

const buildPlanContent = (snapshots: LaneSnapshot[] = laneSnapshots) => {
  if (!plan) return '';
  let content = plan.steps?.length
    ? generatePlanMarkdown(plan)
    : plan.markdown_plan || '';
    if (discoveryNotes) {
      const notesSection = formatDiscoveryNotes(discoveryNotes);
      if (notesSection) {
        content += content.includes('Discovery Notes')
          ? `\n${notesSection}`
          : `\n\n${notesSection}`;
      }
    }

  const visualSection: string[] = [];
  if (snapshots.length) {
    snapshots.forEach((lane) => {
      if (lane.url) {
        visualSection.push(`- [ ] ${lane.title} mockup → ${lane.url}`);
      } else if (lane.html) {
        visualSection.push(`- [ ] ${lane.title} mockup exported locally.`);
      } else {
        visualSection.push(`- [ ] ${lane.title} mockup ready via Mockup Orchestrator.`);
      }
    });
  }
    if (mockupBrief.trim()) {
      visualSection.push(`- [ ] Art direction: ${mockupBrief.trim()}`);
    }
    if (visualSection.length) {
      content += `\n\n## Visual Reference\n${visualSection.join('\n')}`;
    }

    return content.trim();
  };

  const buildMockupPrompt = (
    planSnapshot: DecodedPlan,
    instructionsText: string,
    artDirection?: string,
  ) => {
    const summary = planSnapshot.analysis?.summary || 'No summary provided.';
    const stepsSummary = planSnapshot.steps
      ?.map(
        (step) =>
          `• ${step.title}: ${step.description || 'Focus on this workstream.'}`,
      )
      .join('\n') || '• No specific steps provided.';
    const directive = artDirection?.trim()
      ? `MOCKUP DIRECTIVE:
${artDirection.trim()}`
      : '';

    return `PROJECT NAME: ${planSnapshot.project_name || 'Untitled System'}

SUMMARY:
${summary}

KEY WORKSTREAMS:
${stepsSummary}

IGNITE MOCKUP STANDARD:
${MOCKUP_STANDARD_COPY}

${directive}

HTML MOCKUP INSTRUCTIONS:
${instructionsText || DEFAULT_MOCKUP_GUIDANCE}

OUTPUT REQUIREMENTS:
- Return a single HTML document with inline <style>.
- Include a hero section, feature grid/list, and clear CTA.
- Use neutral fonts (Inter, system fonts) and subtle gradients that match a dark factory aesthetic.
- Keep copy short and reference the roles/entities mentioned above.`;
  };





  const handleManualSaveConfirm = () => {
    setPlanDownloaded(true);
    toast.success('Marked as saved.');
  };

  useEffect(() => {
    if (!plan) {
      setMockupApproved(false);
      setMockupBrief('');
      setLaneSnapshots([]);
      setLaneSummary({ total: 0, ready: 0 });
    }
  }, [plan]);

  const uploadPlan = async (content: string) => {
    setUploadingPlan(true);
    try {
      const bucket = import.meta.env.VITE_PLAN_BUCKET || 'plans';
      const safeName =
        (plan?.project_name || 'ignite-plan')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'ignite-plan';
      const ownerSlug = sanitizeName(user?.id || 'anon');
      const filePath = `${ownerSlug}/${sessionSlug}/${safeName}-${Date.now()}.md`;
      const fileBlob = new Blob([content], { type: 'text/markdown' });

      const { data: existingBucket } = await supabase.storage.getBucket(bucket);

      if (!existingBucket) {
        setBucketHealthy(false);
        setBucketChecked(true);
        throw new Error(
          `Bucket "${bucket}" not found. Run npm run storage:setup to create it.`,
        );
      }

      const { error } = await supabase.storage
        .from(bucket)
        .upload(filePath, fileBlob, { upsert: true, contentType: 'text/markdown' });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(filePath);

      setPlanLink(publicUrl);
      setBucketHealthy(true);
      setBucketChecked(true);
      toast.success('Plan uploaded to Supabase Storage');
    } catch (err: any) {
      setPlanLink(null);
      toast.error(
        `Plan uploaded locally, but cloud storage failed: ${err?.message || err}`,
      );
    } finally {
      setUploadingPlan(false);
    }
  };

  const getCursorInstructions = () => {
    const planName = plan?.project_name || 'this system';
    const laneWithUrl = laneSnapshots.find((lane) => lane.url);
    const visualInstruction = laneWithUrl
      ? `Open the approved mockup for ${laneWithUrl.title} at ${laneWithUrl.url} before touching UI code.`
      : laneSnapshots.length
        ? 'Open the Blueprint Mockup tab to view the approved lanes before touching UI views.'
        : 'Use the Visual Reference section in PLAN.md for the approved mockups.';
    if (planLink) {
      return `Download PLAN.md from ${planLink}
${visualInstruction}
Then open it in Cursor. Execute Phase 1 exactly and check off items in the markdown.
Ask me before starting Phase 2.`;
    }
    return `PLAN.md is saved at ./PLAN.md in the repo. ${visualInstruction}
Please load it and execute Phase 1 for ${planName}. Check off each task and ask for approval before Phase 2.`;
  };

const uploadLaneMockups = async (): Promise<UploadedMockup[] | null> => {
  const readyLanes = laneSnapshots.filter((lane) => typeof lane.html === 'string' && lane.html.trim().length > 0);
  if (!readyLanes.length) {
    return [];
  }

  try {
    const { data, error } = await supabase.functions.invoke('blueprint-library', {
      body: {
        projectName: plan?.project_name ?? input ?? 'Ignite Zero System',
        ownerId: user?.id ?? 'anon',
        sessionId: sessionSlug,
        lanes: readyLanes.map((lane) => ({
          laneId: lane.id,
          title: lane.title,
          html: lane.html,
        })),
      },
    });

    if (error) {
      throw error;
    }

    if (!Array.isArray(data?.mockups)) {
      return [];
    }

    toast.success('Mockups linked to PLAN.md');
    return data.mockups as UploadedMockup[];
  } catch (err: any) {
    toast.error(`Failed to save mockups: ${err?.message ?? 'Unknown error'}`);
    return null;
  }
};

const downloadPlan = async () => {
  if (!plan) return;

  let snapshotsForPlan = laneSnapshots;
  const needsUpload = laneSnapshots.some((lane) => lane.html && !lane.url);
  if (needsUpload) {
    const uploaded = await uploadLaneMockups();
    if (uploaded === null) {
      return;
    }
    const updatedSnapshots = laneSnapshots.map((lane) => {
      const match = uploaded.find((item) => item.laneId === lane.id || item.laneId === slugifyLaneId(lane.id));
      return match ? { ...lane, url: match.url } : lane;
    });
    snapshotsForPlan = updatedSnapshots;
    setLaneSnapshots(updatedSnapshots);
  }

  const content = buildPlanContent(snapshotsForPlan);
  if (!content) return;
  const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PLAN.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  toast.success('PLAN.md downloaded');
  setPlanDownloaded(true);
  await uploadPlan(content);
  };

const slugifyLaneId = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || value;

  const copyDriverPrompt = () => {
    const driverPrompt = `I have initialized PLAN.md in the project root. This file contains a phased execution plan for ${plan?.project_name || 'the system'}.

Please execute Phase 1 step by step. After each step is complete, check it off in PLAN.md and proceed to the next step.

When Phase 1 is complete, ask me to confirm before starting Phase 2.`;
    
    navigator.clipboard.writeText(driverPrompt);
    toast.success('Driver prompt copied to clipboard');
  };

  const surpriseMe = () => {
    const randomIdea = RANDOM_IDEAS[Math.floor(Math.random() * RANDOM_IDEAS.length)];
    setInput(randomIdea);
    toast.success('Random idea generated!');
  };

  const reset = () => {
    const newSlug = rotateSessionSlug();
    setSessionSlug(newSlug);
    setInput('');
    setPlan(null);
    setWizardStep(0);
    setPlanDownloaded(false);
    setRefinements([]);
    setMockupApproved(false);
    setMockupBrief('');
    setLaneSnapshots([]);
    setLaneSummary({ total: 0, ready: 0 });
    setConsultantMode(null);
    toast.success('Session reset. Fresh start.');
    setSessionSlug(rotateSessionSlug());
  };

  const stepLabels = ['Input', 'Strategy', 'Planning', 'Execution'];
  const orchestratorDocument = [input, buildPlanContent(), plan ? JSON.stringify(plan, null, 2) : '']
    .filter((segment) => Boolean(segment && segment.trim()))
    .join('\n\n');

  return (
    <div className="space-y-8 relative">
      {/* Consultant Chat Slide-over */}
      {consultantMode && plan && (
        <ConsultantChat
          mode={consultantMode}
          context={plan}
          ownerId={user?.id ?? undefined}
          sessionId={sessionSlug}
          sourcePrompt={input}
          mockups={laneSnapshots}
          onUpdatePlan={handleRefinedPrompt}
          onMockupBrief={handleMockupBriefFromConsultant}
          onClose={() => setConsultantMode(null)}
        />
      )}


      {/* Version Marker / Manual Link */}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <Badge variant="outline" className="text-[10px] font-mono text-slate-600 border-slate-800">
          v2.0.0-platinum-fixed
        </Badge>
        <Button
          variant="outline"
          size="sm"
          className="text-xs font-mono text-slate-300 border-slate-700 hover:text-emerald-300"
          asChild
        >
          <a href={TEAM_MANUAL_URL} target="_blank" rel="noreferrer">
            📘 Open Team Manual
          </a>
        </Button>
      </div>
      
      {/* Progress Bar (only show after step 0) */}
      {wizardStep > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono">
            {stepLabels.map((label, i) => (
              <span 
                key={i} 
                className={`${i <= wizardStep ? 'text-emerald-400' : 'text-slate-600'} transition-colors`}
              >
                {i + 1}. {label}
              </span>
            ))}
          </div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500"
              style={{ width: `${(wizardStep / 3) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* View 0: Input */}
      {wizardStep === 0 && (
        <div className="space-y-10 transition-opacity duration-300">
          {/* Hero */}
          <div className="text-center py-8">
            <h1 className="text-6xl md:text-7xl font-black text-white tracking-tight leading-tight mb-4">
              What are we <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">building</span> today?
            </h1>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Describe your idea in plain English. The Architect will analyze, reframe, and generate a complete execution plan.
            </p>
          </div>

          {/* Input Area - Enhanced Visual Weight */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border-2 border-slate-700 rounded-2xl p-3 shadow-2xl ring-2 ring-emerald-500/10 hover:ring-emerald-500/20 transition-all">
            <div className="px-5 py-4 flex items-center justify-between border-b border-slate-800 mb-3">
              <span className="text-lg font-bold text-white">Your Idea</span>
              <Button 
                variant="ghost"
                size="sm"
                onClick={surpriseMe}
                aria-label="Generate random idea"
                className="h-9 px-5 border border-slate-600 hover:border-emerald-400 hover:bg-emerald-950/30 text-slate-400 hover:text-emerald-400 rounded-full text-sm font-medium transition-all"
              >
                <Dice5 className="h-4 w-4 mr-2" />
                Surprise Me
              </Button>
            </div>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-h-[160px] bg-transparent border-0 text-slate-100 text-lg focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-0 resize-none leading-relaxed px-6 py-5"
              placeholder="e.g. I want a system for a Dog Walking business where I can track which dogs have been walked..."
            />
          </div>

          {/* Action Button - Maximum Visual Weight */}
          <Button 
            onClick={decode} 
            disabled={loading || !input.trim()}
            className="w-full bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold py-8 text-2xl rounded-2xl shadow-2xl shadow-emerald-500/40 hover:shadow-emerald-500/60 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 relative overflow-hidden group focus-visible:ring-4 focus-visible:ring-emerald-400"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></span>
            {loading ? (
              <>
                <Sparkles className="h-6 w-6 mr-3 animate-pulse" />
                <span className="animate-pulse">Analyzing your idea...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-6 w-6 mr-3" />
                ✨ Design My System
              </>
            )}
          </Button>
        </div>
      )}

      {/* View 1: Strategy Review */}
      {wizardStep === 1 && plan && (
        <Card className="border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 hover:scale-[1.005] transition-transform duration-200">
          <CardContent className="pt-10 space-y-10">
            <div className="text-center mb-8">
              <h3 className="text-4xl font-black text-transparent bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text mb-3">{plan.project_name}</h3>
              <p className="text-sm text-slate-400 font-mono uppercase tracking-wider">Architectural Analysis</p>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 space-y-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h4 className="text-emerald-400 font-mono text-lg font-bold uppercase tracking-wider">
                    Mockup Standard & Brief
                  </h4>
                  <p className="text-sm text-slate-400">
                    Every mock follows this spec so Cursor builds pixel-perfect UI. Capture palette, density, and references below.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={copyMockupSpec} className="text-xs">
                  Copy Mockup Spec
                </Button>
              </div>
              <div className="grid md:grid-cols-2 gap-3 text-xs font-mono text-slate-400">
                {MOCKUP_SPEC_LINES.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>
              <Textarea
                value={mockupBrief}
                onChange={(e) => setMockupBrief(e.target.value)}
                placeholder="Describe palette (emerald + magenta), layout density (airy, cards), references (Notion dashboard, Stripe metrics)..."
                className="min-h-[120px] bg-slate-900 border-slate-700 text-slate-100"
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() => setConsultantMode('mockup')}
                  className="border-emerald-500/50 text-emerald-300 hover:bg-emerald-950"
                >
                  🎨 Co-create with Consultant
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMockupBrief('')}
                  className="text-slate-400 hover:text-slate-100"
                >
                  Clear Brief
                </Button>
              </div>
            </div>

            {/* Strategy Card */}
            {plan.analysis && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-10 hover:border-slate-700 transition-colors">
                <h4 className="text-emerald-400 font-mono text-lg font-bold mb-6 uppercase tracking-wider">Reframing Strategy</h4>
                <p className="text-base text-slate-300 mb-10 leading-relaxed">{plan.analysis.summary}</p>
                
                <div className="grid md:grid-cols-2 gap-10">
                  {/* Pros */}
                  <div className="space-y-5">
                    <h5 className="text-base text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-2">
                      <CheckCircle2 className="h-6 w-6" />
                      Gains
                    </h5>
                    <ul className="space-y-4">
                      {plan.analysis.pros.map((pro, i) => (
                        <li key={i} className="flex items-start gap-3 text-base text-slate-300 leading-relaxed">
                          <span className="text-emerald-400 text-xl mt-0.5">•</span>
                          <span>{pro}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  {/* Cons */}
                  <div className="space-y-5">
                    <h5 className="text-base text-amber-400 font-bold uppercase tracking-wider flex items-center gap-2">
                      <AlertTriangle className="h-6 w-6" />
                      Trade-offs
                    </h5>
                    <ul className="space-y-4">
                      {plan.analysis.cons.map((con, i) => (
                        <li key={i} className="flex items-start gap-3 text-base text-slate-300 leading-relaxed">
                          <span className="text-amber-400 text-xl mt-0.5">•</span>
                          <span>{con}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {discoveryNotes && (
              <div className="bg-slate-950 border border-cyan-700/50 rounded-xl p-8 space-y-4">
                <h4 className="text-cyan-400 font-mono text-lg font-bold uppercase tracking-wider">
                  Discovery Notes
                </h4>
                <p className="text-sm text-slate-400">
                  Clarifications captured during the consult loop:
                </p>
                <ul className="space-y-3 text-base text-slate-300 list-disc list-inside">
                  {getDiscoveryLines(discoveryNotes).map((line, idx) => (
                    <li key={idx} className="leading-relaxed">{line}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 sm:p-6 space-y-6 hover:border-slate-700 transition-colors">
              <MockupOrchestrator
                key={sessionSlug}
                documentSource={orchestratorDocument}
                artDirection={mockupBrief}
                planName={plan?.project_name}
                onLanesChange={(snapshots, summary) => {
                  setLaneSnapshots(snapshots);
                  setLaneSummary(summary);
                  setMockupApproved(summary.total > 0 && summary.ready === summary.total);
                }}
              />
            </div>

            {/* Legacy Fallback */}
            {plan.architecture_pivot && !plan.analysis && (
              <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4">
                <Badge className="bg-yellow-600 text-black mb-2">REFRAMED</Badge>
                <p className="text-sm text-yellow-200">{plan.architecture_pivot}</p>
              </div>
            )}

            <div className="flex gap-6 pt-8">
              <Button 
                onClick={reset} 
                variant="outline" 
                className="border-slate-700 hover:bg-slate-800 hover:border-slate-600 px-8 py-3 text-base font-semibold transition-all focus-visible:ring-2 focus-visible:ring-slate-500"
                aria-label="Start over"
              >
                ← Start Over
              </Button>
              
              <Button 
                onClick={() => setConsultantMode('plan')}
                variant="outline"
                className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-950 hover:text-emerald-300 hover:border-emerald-400 px-8 py-3 text-base font-semibold transition-all focus-visible:ring-2 focus-visible:ring-emerald-500"
                aria-label="Open consultant chat"
              >
                💬 Consult / Refine
              </Button>

              <Button 
                onClick={() => setWizardStep(2)}
                className="flex-1 bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold py-4 text-lg shadow-xl shadow-emerald-500/40 hover:shadow-emerald-500/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-4 focus-visible:ring-emerald-400"
                disabled={!mockupApproved}
              >
                {mockupApproved ? 'Continue to PLAN.md →' : 'Approve the mockup to continue'}
              </Button>
              {laneSummary.total > 0 && (
                <p className="text-xs text-slate-500">
                  {laneSummary.ready}/{laneSummary.total} mockup lanes ready
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* View 2: Planning (Download) */}
      {wizardStep === 2 && plan && (
        <Card className="border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 hover:scale-[1.005] transition-transform duration-200">
          <CardContent className="pt-10 space-y-10">
            <div className="text-center space-y-5">
              <div className="flex justify-center">
                <FileText className="h-24 w-24 text-cyan-400 drop-shadow-lg" />
              </div>
              <h3 className="text-4xl font-black text-transparent bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text">Execution Plan Ready</h3>
              <p className="text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
                Download the phased execution plan. This markdown file contains checkboxes for each step.
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-10 space-y-8 hover:border-slate-700 transition-colors">
              {/* Plan Preview */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-emerald-400" />
                  <h4 className="text-base font-bold text-emerald-400 uppercase tracking-wider">Plan Preview</h4>
                </div>
                <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 h-80 overflow-y-auto hover:border-slate-600 transition-colors">
                  <pre className="text-sm font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {buildPlanContent() || 'No plan generated yet.'}
                  </pre>
                </div>
              </div>

              <Button 
                onClick={downloadPlan}
                className="w-full bg-gradient-to-br from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold py-7 text-xl rounded-xl shadow-2xl shadow-emerald-500/40 hover:shadow-emerald-500/60 hover:scale-[1.01] transition-all focus-visible:ring-4 focus-visible:ring-emerald-400"
                aria-label="Download PLAN.md"
              >
                ⬇️ Download PLAN.md
              </Button>
              
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-2">
              <p className="text-xs text-slate-400 font-mono">
                📁 Save location: <span className="text-emerald-400 font-bold">./PLAN.md</span> (project root)
              </p>
              <Button
                variant="outline"
                size="sm"
                className="text-[11px]"
                onClick={handleManualSaveConfirm}
              >
                I saved it manually
              </Button>
              {uploadingPlan && (
                <p className="text-xs text-cyan-400 font-mono">Uploading plan to Supabase Storage...</p>
              )}
              {planLink && !uploadingPlan && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-300">
                    ✅ Cloud copy ready. Share this link with Cursor so it can fetch PLAN.md:
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-emerald-300 break-all flex-1">
                      {planLink}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(planLink);
                        toast.success('Link copied. Paste into Cursor chat.');
                      }}
                    >
                      Copy Link
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    👉 Tip: Tell Cursor “PLAN.md lives at {planLink}” so it can download it directly.
                  </p>
                </div>
              )}
              {!planLink && bucketChecked && !bucketHealthy && (
                <div className="space-y-2 text-xs text-red-300">
                  <p>⚠️ Storage bucket missing or private.</p>
                  <p>
                    Paste this command into your terminal or Cursor shell, then click “I ran it”:
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono bg-slate-800 px-2 py-1 rounded">
                      npm run storage:setup
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText('npm run storage:setup');
                        toast.success('Command copied');
                      }}
                    >
                      Copy Command
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setBucketChecked(false);
                        uploadPlan(buildPlanContent());
                      }}
                    >
                    I ran it – recheck
                  </Button>
                </div>
              </div>
              )}
            </div>
            </div>

            <div className="flex gap-6">
              <Button 
                onClick={() => setWizardStep(1)} 
                variant="outline" 
                className="border-slate-700 hover:bg-slate-800 hover:border-slate-600 px-8 py-3 text-base font-semibold transition-all focus-visible:ring-2 focus-visible:ring-slate-500"
                aria-label="Back to strategy"
              >
                ← Back to Strategy
              </Button>
              <Button 
                onClick={() => setWizardStep(3)}
                disabled={!planDownloaded}
                className="flex-1 bg-gradient-to-br from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white font-bold py-4 text-lg shadow-xl shadow-cyan-500/40 hover:shadow-cyan-500/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-4 focus-visible:ring-cyan-400"
              >
                I have saved the file →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* View 3: Execution (Driver Prompt) */}
      {wizardStep === 3 && plan && (
        <Card className="border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 hover:scale-[1.005] transition-transform duration-200">
          <CardContent className="pt-10 space-y-10">
            <div className="text-center space-y-5">
              <h3 className="text-4xl font-black text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text">Ready to Execute</h3>
              <p className="text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">Copy this prompt and paste it into Cursor Composer</p>
            </div>

            <div className="bg-slate-950 border-2 border-emerald-700/50 rounded-xl p-10 space-y-8 hover:border-emerald-600/50 transition-colors">
              <div className="flex items-center gap-3 mb-2">
                <Sparkles className="h-6 w-6 text-emerald-400" />
                <h4 className="text-emerald-400 font-mono text-lg font-bold uppercase tracking-wider">Cursor Driver Prompt</h4>
              </div>
              
              <pre className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-base text-slate-200 whitespace-pre-wrap font-mono leading-relaxed">
{`I have initialized PLAN.md in the project root. This file contains a phased execution plan for ${plan.project_name}.

Please execute Phase 1 step by step. After each step is complete, check it off in PLAN.md and proceed to the next step.

When Phase 1 is complete, ask me to confirm before starting Phase 2.`}
              </pre>

              <Button 
                onClick={copyDriverPrompt}
                className="w-full bg-gradient-to-br from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold py-7 text-xl rounded-xl shadow-2xl shadow-emerald-500/40 hover:shadow-emerald-500/60 hover:scale-[1.01] transition-all focus-visible:ring-4 focus-visible:ring-emerald-400"
                aria-label="Copy driver prompt to clipboard"
              >
                <Copy className="h-6 w-6 mr-3" />
                Copy to Cursor
              </Button>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Cursor Instructions</h5>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(getCursorInstructions());
                      toast.success('Cursor instructions copied');
                    }}
                  >
                    Copy Text
                  </Button>
                </div>
                <pre className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed font-mono">
                  {getCursorInstructions()}
                </pre>
                {!planLink && (
                  <p className="text-[11px] text-slate-500">
                    ⚠️ Share PLAN.md with Cursor (e.g. upload to Drive) so it can open the file.
                  </p>
                )}
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-900/20 to-cyan-900/20 border border-blue-600/50 rounded-xl p-6">
              <p className="text-base text-blue-200 font-mono leading-relaxed">
                💡 <strong>Next:</strong> Paste this into Cursor Composer to start the factory.
              </p>
            </div>

            <div className="flex gap-6 pt-6 border-t border-slate-800">
              <Button 
                onClick={reset} 
                variant="outline" 
                className="border-slate-700 hover:bg-slate-800 hover:border-slate-600 px-8 py-3 text-base font-semibold transition-all focus-visible:ring-2 focus-visible:ring-slate-500"
                aria-label="Start new blueprint"
              >
                Start New Blueprint
              </Button>
              <Button 
                onClick={() => setWizardStep(2)}
                variant="ghost"
                className="text-slate-400 hover:text-slate-200 px-6 py-3 text-base font-semibold transition-all"
                aria-label="Back to planning"
              >
                ← Back to Planning
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
