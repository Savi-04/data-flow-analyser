// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Octokit } from 'octokit';

/**
 * Exercises the whole Deep-Dive pipeline with the model mocked, so the parts
 * that are ours — stage orchestration, concurrency, validation of model
 * output, and graceful degradation — are verified without a network call.
 */

const generateContent = vi.fn();
const sendMessage = vi.fn();

vi.mock('@google/genai', () => ({
    GoogleGenAI: class {
        models = { generateContent };
        chats = { create: async () => ({ sendMessage }) };
    },
    Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', INTEGER: 'INTEGER' },
    FunctionCallingConfigMode: { AUTO: 'AUTO' },
    createPartFromFunctionResponse: (id: string, name: string, response: unknown) => ({
        functionResponse: { id, name, response },
    }),
}));

const { runDeepDiveAnalysis } = await import('./analyzeAgent');

const FILES: Record<string, string> = {
    'src/App.tsx': `
import { useState } from 'react';
import { LoginForm } from './LoginForm';
import { Dashboard } from './Dashboard';
export function App() {
  const [user, setUser] = useState(null);
  return <div><LoginForm user={user} /><Dashboard user={user} /></div>;
}`,
    'src/LoginForm.tsx': `
import { useState } from 'react';
export function LoginForm({ user }) {
  const [email, setEmail] = useState('');
  return <form>{email}</form>;
}`,
    'src/Dashboard.tsx': `
import { useEffect } from 'react';
import { Chart } from './Chart';
export function Dashboard({ user }) {
  useEffect(() => {}, []);
  return <Chart />;
}`,
    'src/Chart.tsx': `
export function Chart() { return <svg />; }`,
};

function fakeOctokit(): Octokit {
    const tree = [
        { path: 'src', type: 'tree', size: 0 },
        ...Object.keys(FILES).map((p) => ({ path: p, type: 'blob', size: FILES[p].length })),
    ];
    return {
        rest: {
            git: { getTree: vi.fn(async () => ({ data: { truncated: false, tree } })) },
            repos: {
                getContent: vi.fn(async ({ path }: { path: string }) => {
                    if (FILES[path] !== undefined) {
                        return { data: { content: Buffer.from(FILES[path]).toString('base64') } };
                    }
                    return { data: [] };
                }),
            },
        },
    } as unknown as Octokit;
}

/** Routes a mocked model response based on which prompt was sent. */
function respond(handlers: { synthesis?: unknown; triage?: unknown; clusters?: unknown }) {
    generateContent.mockImplementation(async ({ contents }: { contents: string }) => {
        if (contents.includes('deterministic graph analyser')) {
            if (handlers.triage instanceof Error) throw handlers.triage;
            return { text: JSON.stringify(handlers.triage) };
        }
        if (contents.includes('functional areas')) {
            if (handlers.clusters instanceof Error) throw handlers.clusters;
            return { text: JSON.stringify(handlers.clusters) };
        }
        if (handlers.synthesis instanceof Error) throw handlers.synthesis;
        return { text: JSON.stringify(handlers.synthesis) };
    });
}

const SYNTH = { summary: 'A small app.', strengths: ['clear'], concerns: ['small'] };

const run = () =>
    runDeepDiveAnalysis({
        octokit: fakeOctokit(),
        owner: 'o',
        repo: `r-${Math.random().toString(36).slice(2)}`, // fresh tree-cache key per run
        rootPath: '',
        fileBudget: 60,
    });

beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_API_KEY = 'test-key';
    // Exploration finishes immediately with no tool calls; the shallow scan
    // already covers this fixture, so discovery is not what is under test here.
    sendMessage.mockResolvedValue({ functionCalls: [], text: 'done' });
});

describe('deep dive pipeline', () => {
    it('produces graph, findings, triage and clusters together', async () => {
        respond({
            synthesis: SYNTH,
            triage: { significant: [{ index: 0, note: 'worth fixing' }], dismissed: [{ index: 1, note: 'entry point' }] },
            // The model only ever sees opaque surrogate ids (n0, n1, ...), never
            // the real path-derived node ids, so fixtures speak surrogates too.
            clusters: { clusters: [{ label: 'Auth flow', purpose: 'Signs users in.', nodeIds: ['n0', 'n1'] }] },
        });

        const r = await run();

        expect(r.graphData.nodes.length).toBeGreaterThan(0);
        expect(r.patterns.length).toBeGreaterThan(0);
        expect(r.assessment).toEqual(SYNTH);
        expect(r.triage?.significant[0]).toMatchObject({ index: 0, rank: 1, note: 'worth fixing' });
        expect(r.clusters[0].label).toBe('Auth flow');
        // Surrogates must come back translated into real graph node ids.
        const realIds = new Set(r.graphData.nodes.map((n) => n.id));
        expect(r.clusters[0].nodeIds).toHaveLength(2);
        for (const id of r.clusters[0].nodeIds) expect(realIds.has(id)).toBe(true);
        expect(r.workflow.errors).toEqual([]);
    });

    it('records a timing for each of the three model stages', async () => {
        respond({ synthesis: SYNTH, triage: { significant: [{ index: 0, note: 'n' }], dismissed: [] }, clusters: { clusters: [] } });
        const r = await run();

        const stages = r.workflow.stageTimings.map((t) => t.stage);
        expect(stages).toContain('synthesis');
        expect(stages).toContain('triage');
        expect(stages).toContain('clustering');
    });

    it('runs the three model stages concurrently, not in series', async () => {
        let inFlight = 0;
        let peak = 0;
        generateContent.mockImplementation(async ({ contents }: { contents: string }) => {
            inFlight++;
            peak = Math.max(peak, inFlight);
            await new Promise((res) => setTimeout(res, 20));
            inFlight--;
            if (contents.includes('deterministic graph analyser')) return { text: JSON.stringify({ significant: [{ index: 0, note: 'n' }], dismissed: [] }) };
            if (contents.includes('functional areas')) return { text: JSON.stringify({ clusters: [] }) };
            return { text: JSON.stringify(SYNTH) };
        });

        await run();
        expect(peak).toBe(3);
    });

    it('drops invented finding indices end to end', async () => {
        respond({
            synthesis: SYNTH,
            triage: { significant: [{ index: 999, note: 'invented' }, { index: 0, note: 'real' }], dismissed: [] },
            clusters: { clusters: [] },
        });

        const r = await run();
        expect(r.triage?.significant).toEqual([{ index: 0, rank: 1, note: 'real' }]);
    });

    it('drops clusters that reference components not in the graph', async () => {
        respond({
            synthesis: SYNTH,
            triage: { significant: [{ index: 0, note: 'n' }], dismissed: [] },
            clusters: {
                clusters: [
                    { label: 'Real', purpose: 'p', nodeIds: ['n0', 'n1'] },
                    { label: 'Phantom', purpose: 'p', nodeIds: ['n998', 'n999'] },
                ],
            },
        });

        const r = await run();
        expect(r.clusters.map((c) => c.label)).toEqual(['Real']);
    });

    describe('graceful degradation', () => {
        it('keeps the other two stages when triage fails', async () => {
            respond({ synthesis: SYNTH, triage: new Error('triage boom'), clusters: { clusters: [{ label: 'C', purpose: 'p', nodeIds: ['n0', 'n1'] }] } });
            const r = await run();

            expect(r.triage).toBeNull();
            expect(r.assessment).toEqual(SYNTH);
            expect(r.clusters).toHaveLength(1);
            expect(r.workflow.errors.map((e) => e.stage)).toContain('triage');
        });

        it('keeps the other two stages when clustering fails', async () => {
            respond({ synthesis: SYNTH, triage: { significant: [{ index: 0, note: 'n' }], dismissed: [] }, clusters: new Error('cluster boom') });
            const r = await run();

            expect(r.clusters).toEqual([]);
            expect(r.triage).not.toBeNull();
            expect(r.assessment).toEqual(SYNTH);
            expect(r.workflow.errors.map((e) => e.stage)).toContain('clustering');
        });

        it('still returns deterministic results when all three model stages fail', async () => {
            respond({ synthesis: new Error('a'), triage: new Error('b'), clusters: new Error('c') });
            const r = await run();

            expect(r.assessment).toBeNull();
            expect(r.triage).toBeNull();
            expect(r.clusters).toEqual([]);
            expect(r.graphData.nodes.length).toBeGreaterThan(0);
            expect(r.patterns.length).toBeGreaterThan(0);
            expect(r.files.length).toBeGreaterThan(0);
        });

        it('skips the model stages entirely without an API key', async () => {
            delete process.env.GOOGLE_API_KEY;
            respond({ synthesis: SYNTH, triage: {}, clusters: {} });
            const r = await run();

            expect(generateContent).not.toHaveBeenCalled();
            expect(r.triage).toBeNull();
            expect(r.clusters).toEqual([]);
            expect(r.graphData.nodes.length).toBeGreaterThan(0);
        });

        it('falls back to unranked findings when the model returns only invalid indices', async () => {
            respond({ synthesis: SYNTH, triage: { significant: [{ index: 500, note: 'x' }], dismissed: [] }, clusters: { clusters: [] } });
            const r = await run();

            expect(r.triage).toBeNull();
            expect(r.patterns.length).toBeGreaterThan(0);
        });
    });

    it('ignores real node ids, because the model is only ever given surrogates', async () => {
        // Node ids derive from repository file paths, so they are
        // attacker-controlled. The model never receives them, so a response
        // quoting one cannot be genuine and must not be honoured.
        respond({
            synthesis: SYNTH,
            triage: { significant: [], dismissed: [] },
            clusters: { clusters: [{ label: 'Smuggled', purpose: 'p', nodeIds: ['src/App', 'src/LoginForm'] }] },
        });

        const r = await run();
        expect(r.clusters).toEqual([]);
    });
});
