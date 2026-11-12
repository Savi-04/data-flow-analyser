import { Octokit } from 'octokit';
import {
    GoogleGenAI,
    Chat,
    FunctionCallingConfigMode,
    FunctionDeclaration,
    GenerateContentResponse,
    Type,
    createPartFromFunctionResponse,
} from '@google/genai';
import {
    FileNode,
    GraphData,
    StateVariable,
    ArchitecturalPattern,
    ArchitecturalAssessment,
    WorkflowSummary,
    PatternTriage,
    DismissedPattern,
    TriageResult,
    SemanticCluster,
} from '@/types';
import { analyzeCode } from '@/lib/utils/analyzeCode';
import { detectPatterns } from '@/lib/utils/detectPatterns';
import { fetchFileTree, fetchContentsBatched } from '@/lib/utils/githubClient';
import { withRetry } from '@/lib/utils/withRetry';
import { WorkflowContext } from './workflowContext';
import { sanitizeForPrompt, asUntrustedBlock } from '@/lib/utils/sanitize';

/**
 * The Deep-Dive pipeline. Four stages, the model drives 2 and 4:
 *
 *   1. Shallow scan (deterministic)      — a cheap 2-level directory map.
 *   2. Model-driven exploration (agentic) — the model decides which
 *      directories are worth the file budget, via a fetch_subtree tool,
 *      in a loop. This is the step that earns the word "agent".
 *   3. Static analysis (deterministic)    — existing analyzeCode() + detectPatterns().
 *   4. Synthesis (agentic)                — a structured architectural assessment.
 *
 * A model-driven stage failing (missing key, network error, bad JSON)
 * degrades gracefully — the pipeline still returns whatever it discovered
 * deterministically, with the failure recorded in the workflow context
 * rather than aborting the whole request.
 */

// An alias Google keeps pointed at its current recommended flash model,
// rather than a pinned version — pinned IDs (e.g. gemini-2.5-flash) can get
// retired for new API keys even while still listed by ListModels.
const DEFAULT_MODEL = 'gemini-flash-latest';

const SHALLOW_DEPTH = 2;
const SHALLOW_SCAN_FILE_CAP = 60;
const DEEP_MAX_DEPTH = 6;
const MAX_AGENT_ITERATIONS = 6;

const AGENT_SYSTEM_PROMPT = `You are a senior software architect exploring an unfamiliar React/TypeScript repository before it gets statically analysed. You only see a shallow, 2-level-deep directory listing to start. You have a limited file-fetch budget and must decide which directories are worth exploring in full depth to understand the application's real architecture (e.g. app, src, components, pages, hooks) versus which are not worth the budget (e.g. scripts, docs, examples, storybook, config, generated or vendored code). Call fetch_subtree once per directory you want explored, each with a one-sentence reason. Stop calling it once you're confident you've covered the architecturally significant parts of the codebase, or once the tool tells you the budget is exhausted. When you're done, reply with a brief one-sentence summary of your exploration strategy as plain text — do not call the tool again after that.`;

function buildExplorationPrompt(directorySummary: string, remainingBudget: number): string {
    return [
        `Top-level directory map (first ${SHALLOW_DEPTH} levels only).`,
        asUntrustedBlock('directory_map', directorySummary),
        `Remaining file budget: ${remainingBudget}. Decide which directories to explore further.`,
    ].join('\n\n');
}

/** Groups a shallow file listing by top-level directory, for the agent's first look at the repo. */
function summarizeDirectories(files: FileNode[], rootPath: string): string {
    const prefix = rootPath ? `${rootPath.replace(/\/$/, '')}/` : '';
    const buckets = new Map<string, number>();
    const rootFiles: string[] = [];

    for (const file of files) {
        const relative = prefix && file.path.startsWith(prefix) ? file.path.slice(prefix.length) : file.path;
        const slashIndex = relative.indexOf('/');
        if (slashIndex === -1) {
            rootFiles.push(relative);
        } else {
            const dir = relative.slice(0, slashIndex);
            buckets.set(dir, (buckets.get(dir) ?? 0) + 1);
        }
    }

    // Directory and file names come from the caller's repository, and git
    // permits newlines in paths - sanitize before they reach a prompt line.
    const lines = [...buckets.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(
            ([dir, count]) =>
                `${sanitizeForPrompt(dir, 120)}/ — ${count} file${count !== 1 ? 's' : ''} found within the first ${SHALLOW_DEPTH} levels`
        );

    if (rootFiles.length > 0) {
        lines.push(`(root) — ${rootFiles.map((f) => sanitizeForPrompt(f, 120)).join(', ')}`);
    }

    return lines.join('\n') || '(no source files found at the top two levels)';
}

// ─── Stage 2: model-driven exploration ─────────────────────────────────────

async function exploreWithAgent(
    octokit: Octokit,
    owner: string,
    repo: string,
    ref: string | undefined,
    directorySummary: string,
    ctx: WorkflowContext
): Promise<FileNode[]> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        ctx.recordError('agent-exploration', new Error('GOOGLE_API_KEY is not configured on the server.'));
        return [];
    }

    const collected: FileNode[] = [];

    const fetchSubtreeDeclaration: FunctionDeclaration = {
        name: 'fetch_subtree',
        description:
            'Request a full-depth file listing for one directory in the repository, to decide whether it is architecturally significant.',
        parametersJsonSchema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Directory path relative to the repo root, e.g. "app" or "src/components".',
                },
                reason: {
                    type: 'string',
                    description: 'One sentence explaining why this directory is worth exploring.',
                },
            },
            required: ['path', 'reason'],
        },
    };

    let chat: Chat;
    try {
        const ai = new GoogleGenAI({ apiKey, vertexai: false });
        chat = await ai.chats.create({
            model: DEFAULT_MODEL,
            config: {
                systemInstruction: AGENT_SYSTEM_PROMPT,
                tools: [{ functionDeclarations: [fetchSubtreeDeclaration] }],
                toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
            },
        });
    } catch (error) {
        ctx.recordError('agent-exploration', error);
        return [];
    }

    let response: GenerateContentResponse;
    try {
        response = await withRetry(() =>
            chat.sendMessage({ message: buildExplorationPrompt(directorySummary, ctx.remainingBudget()) })
        );
    } catch (error) {
        ctx.recordError('agent-exploration', error);
        return [];
    }

    let iterations = 0;
    while (response.functionCalls && response.functionCalls.length > 0 && iterations < MAX_AGENT_ITERATIONS) {
        iterations++;
        const call = response.functionCalls[0]; // one subtree request per turn — keeps decisions individually auditable
        const rawPath = typeof call.args?.path === 'string' ? call.args.path : '';
        const targetPath = rawPath.replace(/^\/+|\/+$/g, '');
        const reason = typeof call.args?.reason === 'string' ? call.args.reason : '';
        const callId = call.id ?? call.name ?? `fetch_subtree_${iterations}`;
        const callName = call.name ?? 'fetch_subtree';

        let filesFetched = 0;
        let toolResult: Record<string, unknown>;

        if (ctx.remainingBudget() <= 0) {
            toolResult = { output: { skipped: true, note: 'File budget exhausted — no further subtrees can be fetched.' } };
        } else if (!targetPath || ctx.hasFetched(targetPath)) {
            toolResult = { output: { skipped: true, note: 'Already explored, or no path given.' } };
        } else {
            try {
                const tracker = { count: 0 };
                const subtreeFiles = await fetchFileTree(
                    octokit,
                    owner,
                    repo,
                    tracker,
                    { maxFiles: ctx.remainingBudget(), maxDepth: DEEP_MAX_DEPTH },
                    ref,
                    targetPath,
                    0
                );
                collected.push(...subtreeFiles);
                filesFetched = subtreeFiles.length;
                ctx.recordFetch(targetPath, filesFetched);
                toolResult = {
                    output: {
                        filesFound: filesFetched,
                        // Sanitized: these paths are repository content being fed
                        // back into a loop that can call tools.
                        samplePaths: subtreeFiles.slice(0, 10).map((f) => sanitizeForPrompt(f.path, 160)),
                    },
                };
            } catch (error) {
                ctx.recordError('agent-exploration', error);
                toolResult = { error: { message: error instanceof Error ? error.message : 'fetch failed' } };
            }
        }

        ctx.recordDecision({ path: targetPath || '(unspecified)', reason, accepted: filesFetched > 0, filesFetched });

        try {
            response = await withRetry(() =>
                chat.sendMessage({ message: [createPartFromFunctionResponse(callId, callName, toolResult)] })
            );
        } catch (error) {
            ctx.recordError('agent-exploration', error);
            break;
        }
    }

    return collected;
}

// ─── Stages 1 + 2 combined: file discovery ─────────────────────────────────

async function discoverFiles(
    octokit: Octokit,
    owner: string,
    repo: string,
    ref: string | undefined,
    rootPath: string,
    ctx: WorkflowContext
): Promise<FileNode[]> {
    ctx.startStage('shallow-scan');
    const shallowTracker = { count: 0 };
    const shallowFiles = await fetchFileTree(
        octokit,
        owner,
        repo,
        shallowTracker,
        { maxFiles: SHALLOW_SCAN_FILE_CAP, maxDepth: SHALLOW_DEPTH },
        ref,
        rootPath,
        0
    );
    ctx.endStage('shallow-scan');

    const directorySummary = summarizeDirectories(shallowFiles, rootPath);

    ctx.startStage('agent-exploration');
    const agentFiles = await exploreWithAgent(octokit, owner, repo, ref, directorySummary, ctx);
    ctx.endStage('agent-exploration');

    const byPath = new Map<string, FileNode>();
    for (const file of [...shallowFiles, ...agentFiles]) {
        byPath.set(file.path, file);
    }
    return [...byPath.values()];
}

// ─── Stage 4: synthesis ─────────────────────────────────────────────────────

async function synthesizeAssessment(
    graphData: GraphData,
    stateVariables: StateVariable[],
    patterns: ArchitecturalPattern[],
    ctx: WorkflowContext
): Promise<ArchitecturalAssessment | null> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return null;

    ctx.startStage('synthesis');
    try {
        const ai = new GoogleGenAI({ apiKey, vertexai: false });

        const componentSummary = graphData.nodes
            .slice(0, 60)
            .map(
                (n) =>
                    `- ${sanitizeForPrompt(n.name, 80)} (${n.type}, ${n.complexity} connections${n.usesState ? ', stateful' : ''})`
            )
            .join('\n');
        // Descriptions embed component names, which fall back to the raw file
        // path when a node has no parsed name - so they are untrusted too.
        const patternSummary =
            patterns.length > 0
                ? patterns.map((p) => `- [${p.severity}] ${p.kind}: ${sanitizeForPrompt(p.description, 300)}`).join('\n')
                : '(none detected)';

        const prompt = `You are reviewing the architecture of a React/TypeScript codebase from its dependency graph.

Components (${graphData.nodes.length} total, showing up to 60):
${asUntrustedBlock('components', componentSummary)}

State variables tracked: ${stateVariables.length}

Deterministic pattern-detector findings:
${asUntrustedBlock('findings', patternSummary)}

Write a short, neutral architectural assessment. Do not just repeat the findings — synthesize what they mean together.`;

        const response = await withRetry(() =>
            ai.models.generateContent({
                model: DEFAULT_MODEL,
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            summary: { type: Type.STRING },
                            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                            concerns: { type: Type.ARRAY, items: { type: Type.STRING } },
                        },
                        required: ['summary', 'strengths', 'concerns'],
                    },
                },
            })
        );

        const text = response.text;
        if (!text) throw new Error('Empty response from model');

        const parsed = JSON.parse(text) as ArchitecturalAssessment;
        ctx.endStage('synthesis');
        return parsed;
    } catch (error) {
        ctx.recordError('synthesis', error);
        ctx.endStage('synthesis');
        return null;
    }
}

// ─── Stage 5: triage ────────────────────────────────────────────────────────
// detectPatterns() is mechanical, so it cannot tell a god component from a
// legitimate root, or an orphaned module from an entry point — it reports all
// of them. On a real repo that is 30+ findings of which a handful matter.
// This stage ranks and dismisses; it never authors a finding. The model
// addresses findings by index and anything out of range is dropped, so the
// deterministic detector remains the only source of truth.

const MAX_TRIAGE_NOTE_CHARS = 240;

/**
 * Keeps only references the deterministic layer actually produced. Guards
 * against the model inventing indices, repeating them, or putting the same
 * finding in both buckets, and renumbers ranks to a clean 1..n.
 */
export function validateTriage(raw: unknown, patternCount: number): TriageResult | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;

    const inRange = (value: unknown): number | null => {
        const n = typeof value === 'number' ? value : Number(value);
        return Number.isInteger(n) && n >= 0 && n < patternCount ? n : null;
    };
    const note = (value: unknown): string =>
        typeof value === 'string' ? value.trim().slice(0, MAX_TRIAGE_NOTE_CHARS) : '';

    const seen = new Set<number>();
    const significant: PatternTriage[] = [];

    for (const entry of Array.isArray(obj.significant) ? obj.significant : []) {
        if (!entry || typeof entry !== 'object') continue;
        const index = inRange((entry as Record<string, unknown>).index);
        if (index === null || seen.has(index)) continue;
        seen.add(index);
        // Rank comes from position, not from the model, so it is always 1..n
        // with no gaps or ties however the model numbered things.
        significant.push({ index, rank: significant.length + 1, note: note((entry as Record<string, unknown>).note) });
    }

    const dismissed: DismissedPattern[] = [];
    for (const entry of Array.isArray(obj.dismissed) ? obj.dismissed : []) {
        if (!entry || typeof entry !== 'object') continue;
        const index = inRange((entry as Record<string, unknown>).index);
        if (index === null || seen.has(index)) continue; // significant wins
        seen.add(index);
        dismissed.push({ index, note: note((entry as Record<string, unknown>).note) });
    }

    if (significant.length === 0 && dismissed.length === 0) return null;
    return { significant, dismissed };
}

async function triagePatterns(
    graphData: GraphData,
    patterns: ArchitecturalPattern[],
    ctx: WorkflowContext
): Promise<TriageResult | null> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey || patterns.length === 0) return null;

    ctx.startStage('triage');
    try {
        const ai = new GoogleGenAI({ apiKey, vertexai: false });

        // Descriptions carry component names, which fall back to the raw file
        // path - untrusted repository content, so sanitize each line.
        const numbered = patterns
            .map((p, i) => `${i}. [${p.severity}] ${p.kind} — ${sanitizeForPrompt(p.description, 300)}`)
            .join('\n');

        const prompt = `A deterministic graph analyser scanned a React/TypeScript codebase of ${graphData.nodes.length} components and produced the findings below. The analyser is mechanical: it cannot tell a genuine problem from an expected structural trait. For example an "orphaned module" is often just an entry point, and a "god component" is often a legitimate application root.

Findings:
${asUntrustedBlock('findings', numbered)}

Decide which of these a developer should actually act on, and which are noise for this codebase.

Rules:
- Refer to findings ONLY by the numbers above. Do not invent findings.
- Put the ones worth acting on in "significant", most important first.
- Put expected or harmless ones in "dismissed".
- Every finding must appear in exactly one of the two lists.
- Keep each note to one short sentence explaining your reasoning.`;

        const response = await withRetry(() =>
            ai.models.generateContent({
                model: DEFAULT_MODEL,
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            significant: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        index: { type: Type.INTEGER },
                                        note: { type: Type.STRING },
                                    },
                                    required: ['index', 'note'],
                                },
                            },
                            dismissed: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        index: { type: Type.INTEGER },
                                        note: { type: Type.STRING },
                                    },
                                    required: ['index', 'note'],
                                },
                            },
                        },
                        required: ['significant', 'dismissed'],
                    },
                },
            })
        );

        const text = response.text;
        if (!text) throw new Error('Empty response from model');

        const validated = validateTriage(JSON.parse(text), patterns.length);
        if (!validated) throw new Error('Triage response referenced no valid findings');

        ctx.endStage('triage');
        return validated;
    } catch (error) {
        ctx.recordError('triage', error);
        ctx.endStage('triage');
        return null;
    }
}

// ─── Stage 6: semantic clustering ───────────────────────────────────────────
// The graph shows structure but carries no meaning: 200 spheres with no sense
// of which belong together. Connectivity-based grouping is a solved algorithm
// but answers the wrong question, because a real feature spans components/,
// hooks/ and utils/. Deciding that a set of files is "the auth flow" is the
// judgement call, so the model groups — but every id is checked against the
// graph, so a cluster can never reference a component that does not exist.

const MAX_CLUSTERS = 8;
const MIN_CLUSTER_SIZE = 2;
const MAX_CLUSTER_NODES_SENT = 120;
const MAX_LABEL_CHARS = 48;
const MAX_PURPOSE_CHARS = 200;

/** Drops invented node ids, de-duplicates, and discards groups too small to be a cluster. */
export function validateClusters(raw: unknown, validNodeIds: Set<string>): SemanticCluster[] {
    const list = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.clusters) ? (raw as any).clusters : [];
    const clusters: SemanticCluster[] = [];

    for (const entry of list) {
        if (!entry || typeof entry !== 'object') continue;
        const obj = entry as Record<string, unknown>;

        const label = typeof obj.label === 'string' ? obj.label.trim().slice(0, MAX_LABEL_CHARS) : '';
        const purpose = typeof obj.purpose === 'string' ? obj.purpose.trim().slice(0, MAX_PURPOSE_CHARS) : '';
        if (!label) continue;

        const nodeIds = [
            ...new Set(
                (Array.isArray(obj.nodeIds) ? obj.nodeIds : []).filter(
                    (id): id is string => typeof id === 'string' && validNodeIds.has(id)
                )
            ),
        ];

        if (nodeIds.length < MIN_CLUSTER_SIZE) continue;
        clusters.push({ label, purpose, nodeIds });
        if (clusters.length >= MAX_CLUSTERS) break;
    }

    return clusters;
}

async function nameClusters(graphData: GraphData, ctx: WorkflowContext): Promise<SemanticCluster[]> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey || graphData.nodes.length < MIN_CLUSTER_SIZE) return [];

    ctx.startStage('clustering');
    try {
        const ai = new GoogleGenAI({ apiKey, vertexai: false });

        const sent = graphData.nodes.slice(0, MAX_CLUSTER_NODES_SENT);

        // Node ids derive from repository file paths, so they are
        // attacker-controlled. Rather than sanitize them (which would break
        // the mapping back, since a sanitized id no longer equals the real
        // one), the model never sees them: it works with opaque surrogates
        // like "n0" and we translate its answer back ourselves. That removes
        // the identifier channel as an injection surface outright, and makes
        // validation exact rather than best-effort.
        const surrogateToReal = new Map<string, string>();
        const realToSurrogate = new Map<string, string>();
        sent.forEach((node, i) => {
            const surrogate = `n${i}`;
            surrogateToReal.set(surrogate, node.id);
            realToSurrogate.set(node.id, surrogate);
        });

        const nodeList = sent
            .map(
                (n) =>
                    `${realToSurrogate.get(n.id)} | ${sanitizeForPrompt(n.name, 80)} (${n.type}) | ${sanitizeForPrompt(n.filePath, 160)}`
            )
            .join('\n');

        // Only edges between nodes the model can see, so it never reads an
        // id in a relationship that is absent from its own node list.
        const edgeList = graphData.links
            .filter((l) => realToSurrogate.has(l.source) && realToSurrogate.has(l.target))
            .slice(0, 300)
            .map((l) => `${realToSurrogate.get(l.source)} -> ${realToSurrogate.get(l.target)}`)
            .join('\n');

        const prompt = `Below are components from a React/TypeScript codebase, as "id | name (type) | path", followed by their dependency edges.

Components:
${asUntrustedBlock('components', nodeList)}

Edges:
${asUntrustedBlock('edges', edgeList || '(none)')}

Group these into the application's actual functional areas — the features or concerns a developer would recognise, such as an authentication flow, a data table, or a routing layer. A real feature often spans several directories, so group by what the code does, not by folder.

Rules:
- Use ONLY the exact ids listed above. Never invent an id.
- Produce at most ${MAX_CLUSTERS} groups, each with at least ${MIN_CLUSTER_SIZE} components.
- Give each a short label (a few words) and a one-sentence purpose.
- Leave genuinely unrelated components out rather than forcing them into a group.`;

        const response = await withRetry(() =>
            ai.models.generateContent({
                model: DEFAULT_MODEL,
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            clusters: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        label: { type: Type.STRING },
                                        purpose: { type: Type.STRING },
                                        nodeIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                                    },
                                    required: ['label', 'purpose', 'nodeIds'],
                                },
                            },
                        },
                        required: ['clusters'],
                    },
                },
            })
        );

        const text = response.text;
        if (!text) throw new Error('Empty response from model');

        // Validate against the surrogates the model was given, then translate
        // back to real node ids. An invented surrogate fails the lookup and is
        // dropped, so a cluster can only ever point at a real component.
        const validated = validateClusters(JSON.parse(text), new Set(surrogateToReal.keys()));
        const clusters = validated
            .map((cluster) => ({
                ...cluster,
                nodeIds: cluster.nodeIds
                    .map((id) => surrogateToReal.get(id))
                    .filter((id): id is string => Boolean(id)),
            }))
            .filter((cluster) => cluster.nodeIds.length >= MIN_CLUSTER_SIZE);

        ctx.endStage('clustering');
        return clusters;
    } catch (error) {
        ctx.recordError('clustering', error);
        ctx.endStage('clustering');
        return [];
    }
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export interface DeepDiveAnalysisResult {
    files: FileNode[];
    graphData: GraphData;
    stateVariables: StateVariable[];
    patterns: ArchitecturalPattern[];
    assessment: ArchitecturalAssessment | null;
    triage: TriageResult | null;
    clusters: SemanticCluster[];
    workflow: WorkflowSummary;
}

export async function runDeepDiveAnalysis(params: {
    octokit: Octokit;
    owner: string;
    repo: string;
    ref?: string;
    rootPath: string;
    fileBudget: number;
}): Promise<DeepDiveAnalysisResult> {
    const ctx = new WorkflowContext('deep-dive', params.fileBudget);

    const discovered = await discoverFiles(params.octokit, params.owner, params.repo, params.ref, params.rootPath, ctx);
    const boundedFiles = discovered.slice(0, params.fileBudget);

    ctx.startStage('content-fetch');
    const filesWithContent = await fetchContentsBatched(params.octokit, params.owner, params.repo, boundedFiles, params.ref);
    ctx.endStage('content-fetch');

    ctx.startStage('static-analysis');
    const analysis = analyzeCode(filesWithContent);
    const graphData: GraphData = { nodes: analysis.nodes, links: analysis.links };
    const patterns = detectPatterns(graphData, analysis.stateVariables);
    ctx.endStage('static-analysis');

    // The three model-driven stages all read the finished static analysis and
    // none depends on another, so they run concurrently — on a 10s serverless
    // budget that is the difference between fitting and timing out. Each one
    // degrades to null/[] on its own, so a single failure cannot take down the
    // other two or the deterministic results underneath them.
    const [assessment, triage, clusters] = await Promise.all([
        synthesizeAssessment(graphData, analysis.stateVariables, patterns, ctx),
        triagePatterns(graphData, patterns, ctx),
        nameClusters(graphData, ctx),
    ]);

    return {
        files: filesWithContent,
        graphData,
        stateVariables: analysis.stateVariables,
        patterns,
        assessment,
        triage,
        clusters,
        workflow: ctx.summary(),
    };
}
