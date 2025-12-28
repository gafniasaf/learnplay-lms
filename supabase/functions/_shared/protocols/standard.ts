// Standard protocol - wraps existing filler logic for backwards compatibility
// This protocol uses the traditional skeleton + filler approach

import type { GenerationProtocol, ProtocolFillArgs, ProtocolFillResult, ProtocolInput } from "./types.ts";
import { fillSkeleton } from "../filler.ts";

export const standardProtocol: GenerationProtocol = {
  id: 'standard',
  name: 'Standard Generation',
  requiresStudyText: false,
  supportsFormats: ['practice', 'learnplay-v1'],
  
  async fillCourse(args: ProtocolFillArgs): Promise<ProtocolFillResult> {
    const { skeleton, ctx, timeoutMs } = args;
    return await fillSkeleton(skeleton, ctx, timeoutMs);
  },
  
  validateInput(input: ProtocolInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!input.subject || input.subject.trim().length === 0) {
      errors.push('subject is required');
    }
    if (!input.audience || input.audience.trim().length === 0) {
      errors.push('audience is required');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  },
};

