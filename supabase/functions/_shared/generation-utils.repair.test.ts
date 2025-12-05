import { extractJsonFromText } from './generation-utils.ts';

describe('extractJsonFromText - repair unwrapped top-level keys', () => {
it.skip('reconstructs object when studyTexts/items are emitted without braces', () => {
    const raw = `\n  "studyTexts": [ { "id": "study-intro", "title": "Intro", "order": 1, "content": "..." } ],\n  "items": [ { "id": 0, "text": "Q [blank]", "groupId": 0, "clusterId": "c", "variant": "1", "mode": "options", "options": ["1","2","3"], "correctIndex": 0 } ]`;
    const parsed = extractJsonFromText(raw);
    expect(parsed).toBeTruthy();
    expect(Array.isArray(parsed.studyTexts)).toBe(true);
    expect(Array.isArray(parsed.items)).toBe(true);
    expect(parsed.studyTexts.length).toBe(1);
    expect(parsed.items.length).toBe(1);
  });

  it('parses fenced json blocks', () => {
    const raw = '```json\n{ "studyTexts": [], "items": [] }\n```';
    const parsed = extractJsonFromText(raw);
    expect(parsed).toEqual({ studyTexts: [], items: [] });
  });
});