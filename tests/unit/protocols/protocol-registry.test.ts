// Unit tests for protocol registry (Jest)

import type { ProtocolInput } from '../../../supabase/functions/_shared/protocols/types.ts';

const mockGenerateJson = jest.fn();

// Prevent Deno dependency from leaking into Jest via protocol imports.
jest.mock('../../../supabase/functions/_shared/ai.ts', () => ({
  generateJson: (...args: any[]) => mockGenerateJson(...args),
}));

describe('Protocol Registry', () => {
  it('gets standard protocol', async () => {
    const { getProtocol } = await import('../../../supabase/functions/_shared/protocol-registry.ts');
    const protocol = getProtocol('standard');
    expect(protocol.id).toBe('standard');
    expect(protocol.name).toBe('Standard Generation');
    expect(typeof protocol.fillCourse).toBe('function');
  });

  it('gets ec-expert protocol', async () => {
    const { getProtocol } = await import('../../../supabase/functions/_shared/protocol-registry.ts');
    const protocol = getProtocol('ec-expert');
    expect(protocol.id).toBe('ec-expert');
    expect(protocol.name).toBe('ExpertCollege Exercise Protocol');
    expect(typeof protocol.fillCourse).toBe('function');
  });

  it('throws on unknown protocol', async () => {
    const { getProtocol } = await import('../../../supabase/functions/_shared/protocol-registry.ts');
    expect(() => getProtocol('unknown-protocol')).toThrow('Unknown protocol');
  });

  it('lists protocols', async () => {
    const { listProtocols } = await import('../../../supabase/functions/_shared/protocol-registry.ts');
    const protocols = listProtocols();
    expect(protocols.some((p) => p.id === 'standard')).toBe(true);
    expect(protocols.some((p) => p.id === 'ec-expert')).toBe(true);
  });

  it('validates protocol input', async () => {
    const { validateProtocolInput } = await import('../../../supabase/functions/_shared/protocol-registry.ts');
    const input: ProtocolInput = {
      audience: '3-5',
      subject: 'Science',
      theme: 'Biology',
      locale: 'nl-NL',
      studyText: 'Korte studietekst.',
    };
    const validation = validateProtocolInput('ec-expert', input);
    expect(validation.valid).toBe(true);
  });
});

