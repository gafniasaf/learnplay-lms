// Protocol registry for exercise generation strategies
// Central registry that manages different generation protocols (EC Expert, Standard, etc.)

import type { GenerationProtocol, ProtocolDescriptor, ProtocolInput } from "./protocols/types.ts";

// Import protocol implementations (will be created)
import { standardProtocol } from "./protocols/standard.ts";
import { ecExpertProtocol } from "./protocols/ec-expert.ts";

const protocols: Map<string, GenerationProtocol> = new Map([
  ['standard', standardProtocol],
  ['ec-expert', ecExpertProtocol],
]);

/**
 * Get a protocol by ID
 * @throws Error if protocol not found
 */
export function getProtocol(id: string): GenerationProtocol {
  const protocol = protocols.get(id);
  if (!protocol) {
    const available = Array.from(protocols.keys()).join(', ');
    throw new Error(`Unknown protocol: ${id}. Available protocols: ${available}`);
  }
  return protocol;
}

/**
 * List all available protocols
 */
export function listProtocols(): ProtocolDescriptor[] {
  return Array.from(protocols.values()).map(p => ({
    id: p.id,
    name: p.name,
    description: `${p.name} protocol`,
    requiresStudyText: p.requiresStudyText,
    supportsFormats: p.supportsFormats,
  }));
}

/**
 * Validate protocol input requirements
 */
export function validateProtocolInput(
  protocolId: string,
  input: ProtocolInput
): { valid: boolean; errors: string[] } {
  const protocol = getProtocol(protocolId);
  
  // Check if protocol has custom validation
  if (protocol.validateInput) {
    return protocol.validateInput(input);
  }
  
  // Default validation: check study text requirement
  const errors: string[] = [];
  if (protocol.requiresStudyText) {
    if (!input.studyText || input.studyText.trim().length === 0) {
      errors.push(`Protocol '${protocolId}' requires a study text, but none was provided`);
    }
  }
  
  // Validate required fields
  if (!input.audience || input.audience.trim().length === 0) {
    errors.push('audience is required');
  }
  if (!input.subject || input.subject.trim().length === 0) {
    errors.push('subject is required');
  }
  if (!input.theme || input.theme.trim().length === 0) {
    errors.push('theme is required');
  }
  if (!input.locale || input.locale.trim().length === 0) {
    errors.push('locale is required');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

