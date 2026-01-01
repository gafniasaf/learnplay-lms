// Unit tests for EC Expert protocol (Jest)

import type { ProtocolInput } from '../../../supabase/functions/_shared/protocols/types.ts';

const mockGenerateJson = jest.fn();

// Mock the AI wrapper to avoid Deno dependency and network calls.
jest.mock('../../../supabase/functions/_shared/ai.ts', () => ({
  generateJson: (...args: any[]) => mockGenerateJson(...args),
}));

describe('EC Expert Protocol', () => {
  const studyText = `
Zuur-base balans is cruciaal voor het handhaven van homeostase.
De pH-schaal loopt van 0 tot 14, waarbij 7 neutraal is.
`;

  const validInput: ProtocolInput = {
    studyText,
    audience: '3-5',
    subject: 'Zuur-Base Balans',
    theme: 'Zuur-Base Balans en Bloedgas',
    locale: 'nl-NL',
  };

  beforeEach(() => {
    mockGenerateJson.mockReset();
  });

  it('validateInput accepts valid input', async () => {
    const { ecExpertProtocol } = await import('../../../supabase/functions/_shared/protocols/ec-expert.ts');
    const validation = ecExpertProtocol.validateInput?.(validInput);
    expect(validation?.valid).toBe(true);
    expect(validation?.errors).toHaveLength(0);
  });

  it('validateInput rejects missing studyText', async () => {
    const { ecExpertProtocol } = await import('../../../supabase/functions/_shared/protocols/ec-expert.ts');
    const validation = ecExpertProtocol.validateInput?.({ ...validInput, studyText: '' });
    expect(validation?.valid).toBe(false);
    expect(validation?.errors).toContain('studyText is required for EC Expert protocol');
  });

  it('fillCourse performs two-pass generation and fills the skeleton', async () => {
    const { ecExpertProtocol } = await import('../../../supabase/functions/_shared/protocols/ec-expert.ts');

    // Pass 1: objectives (protocol may request extra candidates to avoid low-quality objectives)
    mockGenerateJson.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        objectives: [
          { id: 'obj-1', groupId: 0, description: 'Leg uit wat pH betekent.', bloomLevel: 'understand' },
          { id: 'obj-2', groupId: 0, description: 'De student weet dat pH 7 neutraal is.', bloomLevel: 'remember' },
          { id: 'obj-3', groupId: 0, description: 'De pH-schaal loopt van 0 tot 14.', bloomLevel: 'remember' },
          { id: 'obj-4', groupId: 0, description: 'Bloed is licht basisch rond pH 7,4.', bloomLevel: 'understand' },
        ],
      }),
    });

    // Pass 2: exercises (3 variants)
    mockGenerateJson.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        exercises: [
          {
            stem: 'De pH-schaal heeft als neutrale waarde [blank].',
            options: ['7', '0', '14', '1'],
            correctIndex: 0,
            explanation: 'Neutraal is pH 7.',
            hints: { nudge: 'Denk aan neutraliteit.', guide: 'Het midden van 0-14.', reveal: 'Het is 7.' },
          },
          {
            stem: 'Bloed pH ligt normaal rond [blank].',
            options: ['7,4', '6,0', '9,0', '14,0'],
            correctIndex: 0,
            explanation: 'Bloed is licht basisch rond 7,4.',
            hints: { nudge: 'Het is niet neutraal.', guide: 'Net boven 7.', reveal: 'Ongeveer 7,4.' },
          },
          {
            stem: 'Een lage pH betekent dat iets meer [blank] is.',
            options: ['Zuur', 'Basisch', 'Neutraal', 'Gasvormig'],
            correctIndex: 0,
            explanation: 'Lage pH = zuur.',
            hints: { nudge: 'Denk aan citroen.', guide: 'pH onder 7.', reveal: 'Zuur.' },
          },
        ],
      }),
    });

    const skeleton = {
      id: 'course-1',
      title: 'Test',
      subject: 'Zuur-Base Balans',
      gradeBand: '3-5',
      contentVersion: 'test',
      groups: [{ id: 0, name: 'Foundations' }],
      levels: [{ id: 1, title: 'Level 1', start: 0, end: 2 }],
      studyTexts: [{ id: 'study-intro', title: 'Intro', order: 1, content: '__FILL__' }],
      items: [
        { id: 0, text: '__FILL__', groupId: 0, clusterId: 'c0', variant: '1', mode: 'options' },
        { id: 1, text: '__FILL__', groupId: 0, clusterId: 'c0', variant: '2', mode: 'options' },
        { id: 2, text: '__FILL__', groupId: 0, clusterId: 'c0', variant: '3', mode: 'options' },
      ],
    } as any;

    const res = await ecExpertProtocol.fillCourse({
      skeleton,
      ctx: { requestId: 't', functionName: 'test' },
      input: validInput,
      timeoutMs: 10_000,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.course.studyTexts?.[0]?.content).toContain('Zuur-base balans');
      expect(res.course.items).toHaveLength(3);
      expect(res.course.items[0].text).toContain('[blank]');
      expect(Array.isArray(res.course.items[0].options)).toBe(true);
      expect(typeof res.course.items[0].correctIndex).toBe('number');
    }
  });

  it('fillCourse skips objectives that yield multi-element correct answers', async () => {
    const { ecExpertProtocol } = await import('../../../supabase/functions/_shared/protocols/ec-expert.ts');

    mockGenerateJson.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        objectives: [
          { id: 'obj-1', description: 'Kies het juiste antwoord.', bloomLevel: 'understand' },
          { id: 'obj-2', description: 'Leg uit wat pH betekent.', bloomLevel: 'understand' },
          { id: 'obj-3', description: 'De pH-schaal loopt van 0 tot 14.', bloomLevel: 'remember' },
          { id: 'obj-4', description: 'De student weet dat pH 7 neutraal is.', bloomLevel: 'remember' },
        ],
      }),
    });

    // Objective 1: valid schema but forbidden: correct option combines multiple elements ("X en Y")
    mockGenerateJson.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        exercises: [
          {
            stem: 'Een juiste keuze is [blank].',
            options: ['De lengte en het bloedverlies', 'De kleur van het haar', 'De grootte van de voeten', 'Het gewicht van de navel'],
            correctIndex: 0,
            explanation: 'Dit is het juiste antwoord.',
          },
          {
            stem: 'De correcte optie is [blank].',
            options: ['De lengte en het bloedverlies', 'De kleur van het haar', 'De grootte van de voeten', 'Het gewicht van de navel'],
            correctIndex: 0,
            explanation: 'Dit is het juiste antwoord.',
          },
          {
            stem: 'Het juiste antwoord staat bij [blank].',
            options: ['De lengte en het bloedverlies', 'De kleur van het haar', 'De grootte van de voeten', 'Het gewicht van de navel'],
            correctIndex: 0,
            explanation: 'Dit is het juiste antwoord.',
          },
        ],
      }),
    });

    // Objective 2: valid exercises that should be accepted
    mockGenerateJson.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        exercises: [
          {
            stem: 'De pH-schaal heeft als neutrale waarde [blank].',
            options: ['7', '0', '14', '1'],
            correctIndex: 0,
            explanation: 'Neutraal is pH 7.',
          },
          {
            stem: 'Een lage pH betekent dat iets meer [blank] is.',
            options: ['Zuur', 'Basisch', 'Neutraal', 'Gasvormig'],
            correctIndex: 0,
            explanation: 'Lage pH = zuur.',
          },
          {
            stem: 'Een hoge pH betekent dat iets meer [blank] is.',
            options: ['Basisch', 'Zuur', 'Neutraal', 'Vast'],
            correctIndex: 0,
            explanation: 'Hoge pH = basisch.',
          },
        ],
      }),
    });

    const skeleton = {
      id: 'course-1',
      title: 'Test',
      subject: 'Zuur-Base Balans',
      gradeBand: '3-5',
      contentVersion: 'test',
      groups: [{ id: 0, name: 'Foundations' }],
      levels: [{ id: 1, title: 'Level 1', start: 0, end: 2 }],
      studyTexts: [{ id: 'study-intro', title: 'Intro', order: 1, content: '__FILL__' }],
      items: [
        { id: 0, text: '__FILL__', groupId: 0, clusterId: 'c0', variant: '1', mode: 'options' },
        { id: 1, text: '__FILL__', groupId: 0, clusterId: 'c0', variant: '2', mode: 'options' },
        { id: 2, text: '__FILL__', groupId: 0, clusterId: 'c0', variant: '3', mode: 'options' },
      ],
    } as any;

    const res = await ecExpertProtocol.fillCourse({
      skeleton,
      ctx: { requestId: 't', functionName: 'test' },
      input: validInput,
      timeoutMs: 10_000,
    });

    expect(res.ok).toBe(true);
    expect(mockGenerateJson).toHaveBeenCalledTimes(3);
    if (res.ok) {
      const item0 = res.course.items[0];
      const correct = item0.options?.[item0.correctIndex ?? -1] || '';
      expect(correct).not.toMatch(/\s(en|of)\s/i);
    }
  });
});

