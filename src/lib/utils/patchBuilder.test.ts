import { buildPatch, PatchOperation } from './patchBuilder';

describe('patchBuilder', () => {
  it('generates replace operation for changed value', () => {
    const original = { stem: { text: 'Old text' } };
    const updated = { stem: { text: 'New text' } };

    const patches = buildPatch(original, updated);

    expect(patches).toContainEqual<PatchOperation>({
      op: 'replace',
      path: '/stem/text',
      value: 'New text',
    });
  });

  it('generates add operation for new property', () => {
    const original = { stem: { text: 'Text' } };
    const updated = { stem: { text: 'Text', media: [{ id: '1', url: 'http://example.com' }] } };

    const patches = buildPatch(original, updated);

    expect(patches).toContainEqual(
      expect.objectContaining({
        op: 'add',
        path: '/stem/media',
      })
    );
  });

  it('generates remove operation for deleted property', () => {
    const original = { stem: { text: 'Text', oldField: 'value' } };
    const updated = { stem: { text: 'Text' } };

    const patches = buildPatch(original, updated);

    expect(patches).toContainEqual<PatchOperation>({
      op: 'remove',
      path: '/stem/oldField',
    });
  });

  it('handles array element changes', () => {
    const original = { options: ['A', 'B', 'C'] };
    const updated = { options: ['A', 'B Modified', 'C'] };

    const patches = buildPatch(original, updated);

    expect(patches).toContainEqual<PatchOperation>({
      op: 'replace',
      path: '/options/1',
      value: 'B Modified',
    });
  });

  it('handles nested object changes', () => {
    const original = {
      groups: [{ id: 0, items: [{ id: 0, stem: { text: 'Old' } }] }],
    };
    const updated = {
      groups: [{ id: 0, items: [{ id: 0, stem: { text: 'New' } }] }],
    };

    const patches = buildPatch(original, updated);

    expect(patches).toContainEqual<PatchOperation>({
      op: 'replace',
      path: '/groups/0/items/0/stem/text',
      value: 'New',
    });
  });

  it('returns empty array when no changes', () => {
    const original = { stem: { text: 'Text' } };
    const updated = { stem: { text: 'Text' } };

    const patches = buildPatch(original, updated);

    expect(patches).toEqual([]);
  });
});

