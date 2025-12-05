export type ProductCriticVerdict = 'approved' | 'needs_revision';

export interface ProductCriticFeedback {
  verdict: ProductCriticVerdict;
  missingScreens: string[];
  redundantScreens: string[];
  journeyIssues: string[];
  suggestions: string[];
}

export const buildAutoTuneDirective = (
  feedback?: ProductCriticFeedback,
): string => {
  if (!feedback) return '';
  const directives: string[] = [];

  if (feedback.missingScreens?.length) {
    directives.push(
      `Add or fix the following flows/screens:\n- ${feedback.missingScreens.join(
        '\n- ',
      )}`,
    );
  }

  if (feedback.journeyIssues?.length) {
    directives.push(
      `Resolve user journey blockers:\n- ${feedback.journeyIssues.join(
        '\n- ',
      )}`,
    );
  }

  if (feedback.redundantScreens?.length) {
    directives.push(
      `Remove redundant or duplicate UI:\n- ${feedback.redundantScreens.join(
        '\n- ',
      )}`,
    );
  }

  if (feedback.suggestions?.length) {
    directives.push(
      `Apply Product Critic suggestions:\n- ${feedback.suggestions.join(
        '\n- ',
      )}`,
    );
  }

  return directives.join('\n\n').trim();
};

