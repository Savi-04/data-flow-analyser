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
import { FileNode, GraphData, StateVariable, ArchitecturalPattern, ArchitecturalAssessment, WorkflowSummary } from '@/types';
import { analyzeCode } from '@/lib/utils/analyzeCode';
import { detectPatterns } from '@/lib/utils/detectPatterns';
import { fetchFileTree, fetchContentsBatched } from '@/lib/utils/githubClient';
import { withRetry } from '@/lib/utils/withRetry';
import { WorkflowContext } from './workflowContext';

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
    return `Top-level directory map (first ${SHALLOW_DEPTH} levels only):\n${directorySummary}\n\nRemaining file budget: ${remainingBudget}. Decide which directories to explore further.`;
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

    const lines = [...buckets.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([dir, count]) => `${dir}/ — ${count} file${count !== 1 ? 's' : ''} found within the first ${SHALLOW_DEPTH} levels`);

    if (rootFiles.length > 0) {
        lines.push(`(root) — ${rootFiles.join(', ')}`);
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
                        samplePaths: subtreeFiles.slice(0, 10).map((f) => f.path),
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
            .map((n) => `- ${n.name} (${n.type}, ${n.complexity} connections${n.usesState ? ', stateful' : ''})`)
            .join('\n');
        const patternSummary =
            patterns.length > 0
                ? patterns.map((p) => `- [${p.severity}] ${p.kind}: ${p.description}`).join('\n')
                : '(none detected)';

        const prompt = `You are reviewing the architecture of a React/TypeScript codebase from its dependency graph.

Components (${graphData.nodes.length} total, showing up to 60):
${componentSummary}

State variables tracked: ${stateVariables.length}

Deterministic pattern-detector findings:
${patternSummary}

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

// ─── Orchestrator ────────────────────────────────────────────────────────────

export interface DeepDiveAnalysisResult {
    files: FileNode[];
    graphData: GraphData;
    stateVariables: StateVariable[];
    patterns: ArchitecturalPattern[];
    assessment: ArchitecturalAssessment | null;
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

    const assessment = await synthesizeAssessment(graphData, analysis.stateVariables, patterns, ctx);

    return {
        files: filesWithContent,
        graphData,
        stateVariables: analysis.stateVariables,
        patterns,
        assessment,
        workflow: ctx.summary(),
    };
}
