import { describe, it, expect } from 'vitest';
import { validateTriage, validateClusters } from './analyzeAgent';

/**
 * These validators are the guard that keeps the deterministic detector as the
 * single source of truth: the model may re-order and dismiss findings, but
 * anything it invents has to be dropped before it reaches the UI.
 */

describe('validateTriage', () => {
    it('keeps valid indices and renumbers ranks sequentially', () => {
        const result = validateTriage(
            { significant: [{ index: 2, note: 'real risk' }, { index: 0, note: 'also matters' }], dismissed: [] },
            3
        );

        expect(result?.significant).toEqual([
            { index: 2, rank: 1, note: 'real risk' },
            { index: 0, rank: 2, note: 'also matters' },
        ]);
    });

    it('drops out-of-range indices the model invented', () => {
        const result = validateTriage(
            { significant: [{ index: 0, note: 'ok' }, { index: 99, note: 'invented' }, { index: -1, note: 'bad' }], dismissed: [] },
            3
        );

        expect(result?.significant.map((s) => s.index)).toEqual([0]);
    });

    it('drops non-integer indices', () => {
        const result = validateTriage({ significant: [{ index: 1.5, note: 'x' }, { index: 1, note: 'y' }], dismissed: [] }, 3);
        expect(result?.significant.map((s) => s.index)).toEqual([1]);
    });

    it('de-duplicates a repeated index', () => {
        const result = validateTriage(
            { significant: [{ index: 1, note: 'first' }, { index: 1, note: 'repeat' }], dismissed: [] },
            3
        );

        expect(result?.significant).toHaveLength(1);
        expect(result?.significant[0].note).toBe('first');
    });

    it('lets significant win when a finding appears in both lists', () => {
        const result = validateTriage(
            { significant: [{ index: 1, note: 'matters' }], dismissed: [{ index: 1, note: 'noise' }] },
            3
        );

        expect(result?.significant.map((s) => s.index)).toEqual([1]);
        expect(result?.dismissed).toEqual([]);
    });

    it('collects dismissed findings with their reasons', () => {
        const result = validateTriage({ significant: [], dismissed: [{ index: 0, note: 'entry point' }] }, 2);
        expect(result?.dismissed).toEqual([{ index: 0, note: 'entry point' }]);
    });

    it('truncates an overlong note rather than letting it break the layout', () => {
        const result = validateTriage({ significant: [{ index: 0, note: 'x'.repeat(500) }], dismissed: [] }, 1);
        expect(result!.significant[0].note.length).toBe(240);
    });

    it('returns null when nothing valid survives, so the UI falls back', () => {
        expect(validateTriage({ significant: [{ index: 42, note: 'x' }], dismissed: [] }, 3)).toBeNull();
        expect(validateTriage({ significant: [], dismissed: [] }, 3)).toBeNull();
        expect(validateTriage(null, 3)).toBeNull();
        expect(validateTriage('nonsense', 3)).toBeNull();
    });

    it('tolerates a missing or malformed list', () => {
        const result = validateTriage({ significant: [{ index: 0, note: 'ok' }] }, 2);
        expect(result?.significant).toHaveLength(1);
        expect(result?.dismissed).toEqual([]);
    });
});

describe('validateClusters', () => {
    const ids = new Set(['a', 'b', 'c', 'd']);

    it('keeps clusters whose ids all exist', () => {
        const result = validateClusters(
            { clusters: [{ label: 'Auth flow', purpose: 'Signs users in.', nodeIds: ['a', 'b'] }] },
            ids
        );

        expect(result).toEqual([{ label: 'Auth flow', purpose: 'Signs users in.', nodeIds: ['a', 'b'] }]);
    });

    it('filters out invented node ids', () => {
        const result = validateClusters(
            { clusters: [{ label: 'Mixed', purpose: 'p', nodeIds: ['a', 'ghost', 'b', 'also-fake'] }] },
            ids
        );

        expect(result[0].nodeIds).toEqual(['a', 'b']);
    });

    it('drops a cluster left with fewer than two real ids', () => {
        const result = validateClusters(
            { clusters: [{ label: 'Phantom', purpose: 'p', nodeIds: ['ghost', 'a'] }] },
            ids
        );

        expect(result).toEqual([]);
    });

    it('de-duplicates repeated ids within a cluster', () => {
        const result = validateClusters(
            { clusters: [{ label: 'Dupes', purpose: 'p', nodeIds: ['a', 'a', 'b'] }] },
            ids
        );

        expect(result[0].nodeIds).toEqual(['a', 'b']);
    });

    it('requires a label', () => {
        const result = validateClusters({ clusters: [{ label: '   ', purpose: 'p', nodeIds: ['a', 'b'] }] }, ids);
        expect(result).toEqual([]);
    });

    it('caps the number of clusters at 8', () => {
        const many = Array.from({ length: 20 }, (_, i) => ({ label: `C${i}`, purpose: 'p', nodeIds: ['a', 'b'] }));
        expect(validateClusters({ clusters: many }, ids)).toHaveLength(8);
    });

    it('truncates overlong labels and purposes', () => {
        const result = validateClusters(
            { clusters: [{ label: 'L'.repeat(200), purpose: 'P'.repeat(500), nodeIds: ['a', 'b'] }] },
            ids
        );

        expect(result[0].label.length).toBe(48);
        expect(result[0].purpose.length).toBe(200);
    });

    it('accepts a bare array as well as a wrapped object', () => {
        const result = validateClusters([{ label: 'Bare', purpose: 'p', nodeIds: ['a', 'b'] }], ids);
        expect(result).toHaveLength(1);
    });

    it('returns [] for malformed input', () => {
        expect(validateClusters(null, ids)).toEqual([]);
        expect(validateClusters({ clusters: 'nope' }, ids)).toEqual([]);
        expect(validateClusters({ clusters: [null, 42, 'x'] }, ids)).toEqual([]);
    });
});
