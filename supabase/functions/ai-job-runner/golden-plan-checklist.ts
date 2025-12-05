import type { PlanData } from "./context-builder.ts";

export interface ChecklistSectionResult {
  id: string;
  title: string;
  weight: number;
  completed: boolean;
  percentContribution: number;
  status: string;
  suggestion: string;
}

export interface GoldenPlanStatus {
  percentComplete: number;
  sections: ChecklistSectionResult[];
  summary: string;
  suggestions: string[];
}

const CHECKLIST_WEIGHTS = {
  conceptDrafted: 20,
  conceptApproved: 20,
  mockupGenerated: 20,
  versionControl: 10,
  ctaCoverage: 15,
  liveVerification: 15,
} as const;

const TOTAL_WEIGHT = Object.values(CHECKLIST_WEIGHTS).reduce((a, b) => a + b, 0);

export async function computeGoldenPlanStatus(planData: PlanData): Promise<GoldenPlanStatus> {
  try {
    const verificationSignals = await readVerificationSignals();

    const sections: ChecklistSectionResult[] = [];
    
    // ... logic ...
    
    // Copy existing logic but inside try block
    // For now, I will just patch the function start and end to wrap it.
    
    // Concept drafted
    const conceptDrafted = !!(planData.concept_name && planData.concept_summary);
    sections.push({
      id: "conceptDrafted",
      title: "Concept Drafted",
      weight: CHECKLIST_WEIGHTS.conceptDrafted,
      completed: conceptDrafted,
      percentContribution: conceptDrafted ? CHECKLIST_WEIGHTS.conceptDrafted : 0,
      status: conceptDrafted
        ? `We already have an idea called "${planData.concept_name}".`
        : "We still need to agree on what we’re building.",
      suggestion: conceptDrafted
        ? "Double-check the idea feels right before locking it in."
        : "Describe the product in plain words so I can sketch it out."
    });

    // Concept approved
    const conceptApproved = !!planData.concept_approved;
    sections.push({
      id: "conceptApproved",
      title: "Concept Approved by User",
      weight: CHECKLIST_WEIGHTS.conceptApproved,
      completed: conceptApproved,
      percentContribution: conceptApproved ? CHECKLIST_WEIGHTS.conceptApproved : 0,
      status: conceptApproved ? "You already said yes to the concept." : "We’re waiting on your thumbs-up.",
      suggestion: conceptApproved
        ? "Let's move on to the visual mockup."
        : "Say “yes” or tweak the idea so I know you’re happy with it."
    });

    // Mockup generated
    const mockupGenerated = !!planData.current_mockup_html;
    sections.push({
      id: "mockupGenerated",
      title: "Mockup Generated",
      weight: CHECKLIST_WEIGHTS.mockupGenerated,
      completed: mockupGenerated,
      percentContribution: mockupGenerated ? CHECKLIST_WEIGHTS.mockupGenerated : 0,
      status: mockupGenerated
        ? `Mockup v${planData.current_version || 1} is ready to review.`
        : "No screens drawn yet.",
      suggestion: mockupGenerated
        ? "Ask for feedback or try a new variation."
        : "Once the idea is approved, I’ll draw the first draft."
    });

    // Version control
    const hasVersions = !!(planData.mockup_versions && planData.mockup_versions.length > 0);
    sections.push({
      id: "versionControl",
      title: "Version Control & Iterations",
      weight: CHECKLIST_WEIGHTS.versionControl,
      completed: hasVersions,
      percentContribution: hasVersions ? CHECKLIST_WEIGHTS.versionControl : 0,
      status: hasVersions
        ? `We have ${planData.mockup_versions!.length} saved versions to roll back to.`
        : "No saved versions yet.",
      suggestion: hasVersions
        ? "Feel free to say “revert to version X” if you liked an earlier draft."
        : "After we draw the first mockup I’ll save it as version 1."
    });

    // CTA & coverage
    sections.push({
      id: "ctaCoverage",
      title: "CTA & Coverage Tests",
      weight: CHECKLIST_WEIGHTS.ctaCoverage,
      completed: verificationSignals.ctaCoverage,
      percentContribution: verificationSignals.ctaCoverage ? CHECKLIST_WEIGHTS.ctaCoverage : 0,
      status: verificationSignals.ctaCoverage
        ? "Every button we promised is wired and tested."
        : "Some buttons or flows aren’t tested yet.",
      suggestion: verificationSignals.ctaCoverage
        ? "Remember to rerun the CTA test when we add new flows."
        : "Let’s run the CTA test and wire any missing buttons."
    });

    // Live verification
    sections.push({
      id: "liveVerification",
      title: "Live Edge Verification",
      weight: CHECKLIST_WEIGHTS.liveVerification,
      completed: verificationSignals.liveVerification,
      percentContribution: verificationSignals.liveVerification ? CHECKLIST_WEIGHTS.liveVerification : 0,
      status: verificationSignals.liveVerification
        ? "The factory test run passed on the real backend."
        : "We haven’t run the live “factory check” yet.",
      suggestion: verificationSignals.liveVerification
        ? "Run the live check again after big changes."
        : "Run `VERIFY_LIVE=1 npm run verify` so we know the backend is healthy."
    });

    const percentComplete = sections.reduce((sum, section) => sum + section.percentContribution, 0) / TOTAL_WEIGHT * 100;
    const suggestions = sections.filter((s) => !s.completed).map((s) => s.suggestion);
    const summary = `Golden Plan progress: ${percentComplete.toFixed(0)}% done (${sections.filter(s => s.completed).length} of ${sections.length} checkpoints).`;

    return {
      percentComplete: Math.round(percentComplete),
      sections,
      summary,
      suggestions
    };
  } catch (e) {
    console.error("Error computing golden plan status:", e);
    return {
        percentComplete: 0,
        sections: [],
        summary: "Error computing status",
        suggestions: ["Fix backend error"]
    };
  }
}

async function readVerificationSignals(): Promise<{ ctaCoverage: boolean; liveVerification: boolean }> {
  return { ctaCoverage: false, liveVerification: false };
}

