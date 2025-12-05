import { selfReviewCandidate } from './candidates.ts';

const ai = { generateJson: jest.fn() };
jest.mock('./ai', () => ({
  generateJson: (...args: any[]) => (ai.generateJson as any)(...args),
  getProvider: jest.fn(() => 'openai'),
  getModel: jest.fn(() => 'gpt-4o-mini'),
}));

jest.mock('./log', () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

describe('candidates: selfReviewCandidate', () => {
  const config = { subject: 'Math', grade: '5' } as any;
  const ctx = { requestId: 'r' };

  it('parses review JSON and returns structured scores', async () => {
    (ai.generateJson as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({
        overall: 0.7,
        clarity: 0.8,
        age_fit: 0.9,
        correctness: 0.6,
        notes: 'ok',
      }),
      metrics: { tokens: 10 },
    });

    const result = await selfReviewCandidate({ title: 'X' }, config, ctx, 500);
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(0.7);
    expect(result!.notes).toBe('ok');
  });

  it('returns null on failed LLM call', async () => {
    (ai.generateJson as jest.Mock).mockResolvedValueOnce({ ok: false, error: 'rate_limit' });
    const result = await selfReviewCandidate({ title: 'X' }, config, ctx, 500);
    expect(result).toBeNull();
  });
});


