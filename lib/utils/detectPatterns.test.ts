import { describe, it, expect } from 'vitest';
import { detectPatterns } from './detectPatterns';
import { ComponentNode, GraphData, GraphLink, StateVariable } from '@/types';

function makeNode(overrides: Partial<ComponentNode> & { id: string }): ComponentNode {
    return {
        name: overrides.id,
        type: 'component',
        filePath: `src/${overrides.id}.tsx`,
        imports: [],
        exports: [overrides.id],
        usesState: false,
        usesEffect: false,
        usesProps: false,
        complexity: 1,
        ...overrides,
    };
}

function link(source: string, target: string, props?: string[]): GraphLink {
    return { source, target, ...(props ? { props } : {}) };
}

describe('detectPatterns — prop drilling', () => {
    it('flags a state variable forwarded through 3+ levels', () => {
        const data: GraphData = {
            nodes: ['A', 'B', 'C', 'D'].map((id) => makeNode({ id })),
            links: [
                link('A', 'B', ['user']),
                link('B', 'C', ['user']),
                link('C', 'D', ['user']),
            ],
        };
        const stateVariables: StateVariable[] = [
            { name: 'user', setterName: 'setUser', sourceComponentId: 'A', sourceComponentName: 'A', consumers: ['D'] },
        ];

        const patterns = detectPatterns(data, stateVariables);
        const finding = patterns.find((p) => p.kind === 'prop-drilling');

        expect(finding).toBeDefined();
        expect(finding?.nodeIds).toEqual(['A', 'B', 'C', 'D']);
    });

    it('does not flag a prop passed only one or two levels', () => {
        const data: GraphData = {
            nodes: ['A', 'B', 'C'].map((id) => makeNode({ id })),
            links: [link('A', 'B', ['user']), link('B', 'C', ['user'])],
        };
        const stateVariables: StateVariable[] = [
            { name: 'user', setterName: 'setUser', sourceComponentId: 'A', sourceComponentName: 'A', consumers: ['C'] },
        ];

        const patterns = detectPatterns(data, stateVariables);
        expect(patterns.find((p) => p.kind === 'prop-drilling')).toBeUndefined();
    });
});

describe('detectPatterns — circular dependency', () => {
    it('flags a two-node cycle', () => {
        const data: GraphData = {
            nodes: [makeNode({ id: 'A' }), makeNode({ id: 'B' })],
            links: [link('A', 'B'), link('B', 'A')],
        };

        const patterns = detectPatterns(data);
        const finding = patterns.find((p) => p.kind === 'circular-dependency');

        expect(finding).toBeDefined();
        expect(finding?.nodeIds).toEqual(expect.arrayContaining(['A', 'B']));
    });

    it('does not flag an acyclic chain', () => {
        const data: GraphData = {
            nodes: ['A', 'B', 'C'].map((id) => makeNode({ id })),
            links: [link('A', 'B'), link('B', 'C')],
        };

        const patterns = detectPatterns(data);
        expect(patterns.find((p) => p.kind === 'circular-dependency')).toBeUndefined();
    });
});

describe('detectPatterns — god component', () => {
    it('flags a node whose degree meets the absolute floor', () => {
        const leaves = Array.from({ length: 8 }, (_, i) => `Leaf${i}`);
        const data: GraphData = {
            nodes: [makeNode({ id: 'Hub' }), ...leaves.map((id) => makeNode({ id }))],
            links: leaves.map((id) => link('Hub', id)),
        };

        const patterns = detectPatterns(data);
        const finding = patterns.find((p) => p.kind === 'god-component');

        expect(finding).toBeDefined();
        expect(finding?.nodeIds).toEqual(['Hub']);
    });

    it('does not flag a small, evenly-connected graph', () => {
        const data: GraphData = {
            nodes: ['A', 'B', 'C'].map((id) => makeNode({ id })),
            links: [link('A', 'B'), link('B', 'C')],
        };

        const patterns = detectPatterns(data);
        expect(patterns.find((p) => p.kind === 'god-component')).toBeUndefined();
    });
});

describe('detectPatterns — orphaned module', () => {
    it('flags a node with no inbound links', () => {
        const data: GraphData = {
            nodes: [makeNode({ id: 'Entry' }), makeNode({ id: 'Leaf' })],
            links: [link('Entry', 'Leaf')],
        };

        const patterns = detectPatterns(data);
        const finding = patterns.find((p) => p.kind === 'orphaned-module');

        expect(finding).toBeDefined();
        expect(finding?.nodeIds).toEqual(['Entry']);
    });

    it('does not flag a node that has an inbound link', () => {
        const data: GraphData = {
            nodes: [makeNode({ id: 'Entry' }), makeNode({ id: 'Leaf' })],
            links: [link('Entry', 'Leaf')],
        };

        const patterns = detectPatterns(data);
        expect(patterns.some((p) => p.kind === 'orphaned-module' && p.nodeIds.includes('Leaf'))).toBe(false);
    });
});

describe('detectPatterns — container vs presentational', () => {
    it('classifies a stateful component that renders others as a container', () => {
        const data: GraphData = {
            nodes: [
                makeNode({ id: 'Page', usesState: true }),
                makeNode({ id: 'Card', usesProps: true }),
            ],
            links: [link('Page', 'Card', ['title'])],
        };

        const patterns = detectPatterns(data);
        expect(patterns.some((p) => p.kind === 'container-component' && p.nodeIds.includes('Page'))).toBe(true);
        expect(patterns.some((p) => p.kind === 'presentational-component' && p.nodeIds.includes('Card'))).toBe(true);
    });

    it('does not classify a stateless leaf component as either', () => {
        const data: GraphData = {
            nodes: [makeNode({ id: 'Icon' })], // no state, no effect, no props
            links: [],
        };

        const patterns = detectPatterns(data);
        expect(patterns.find((p) => p.kind === 'container-component' || p.kind === 'presentational-component')).toBeUndefined();
    });
});

describe('detectPatterns — deep hierarchy', () => {
    it('flags a root-to-leaf chain deeper than the threshold', () => {
        const ids = ['R', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6'];
        const data: GraphData = {
            nodes: ids.map((id) => makeNode({ id })),
            links: ids.slice(0, -1).map((id, i) => link(id, ids[i + 1])),
        };

        const patterns = detectPatterns(data);
        const finding = patterns.find((p) => p.kind === 'deep-hierarchy');

        expect(finding).toBeDefined();
        expect(finding?.nodeIds).toEqual(['R']);
    });

    it('does not flag a shallow tree', () => {
        const ids = ['R', 'N1', 'N2'];
        const data: GraphData = {
            nodes: ids.map((id) => makeNode({ id })),
            links: ids.slice(0, -1).map((id, i) => link(id, ids[i + 1])),
        };

        const patterns = detectPatterns(data);
        expect(patterns.find((p) => p.kind === 'deep-hierarchy')).toBeUndefined();
    });
});
