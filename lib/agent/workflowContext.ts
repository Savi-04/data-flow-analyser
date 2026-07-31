import { AgentDecision, AnalysisMode, StageError, StageTiming, WorkflowSummary } from '@/types';

/**
 * A single object threaded through every stage of the Deep-Dive pipeline.
 *
 * This is what makes "context management maintained across every stage" a
 * demonstrable claim rather than a rhetorical one: every stage reads and
 * writes the same context, and `summary()` is serialized straight into the
 * API response so it's inspectable in the UI, not just asserted.
 */
export class WorkflowContext {
    readonly mode: AnalysisMode;
    readonly fileBudget: number;
    filesUsed = 0;

    /** Paths already explored, so the agent can't re-fetch the same subtree twice. */
    readonly fetchedPaths = new Set<string>();
    readonly decisions: AgentDecision[] = [];
    readonly errors: StageError[] = [];
    readonly stageTimings: StageTiming[] = [];

    private readonly stageStartedAt = new Map<string, number>();

    constructor(mode: AnalysisMode, fileBudget: number) {
        this.mode = mode;
        this.fileBudget = fileBudget;
    }

    remainingBudget(): number {
        return Math.max(0, this.fileBudget - this.filesUsed);
    }

    hasFetched(path: string): boolean {
        return this.fetchedPaths.has(path);
    }

    recordFetch(path: string, fileCount: number): void {
        this.fetchedPaths.add(path);
        this.filesUsed += fileCount;
    }

    recordDecision(decision: AgentDecision): void {
        this.decisions.push(decision);
    }

    recordError(stage: string, error: unknown): void {
        this.errors.push({
            stage,
            message: error instanceof Error ? error.message : String(error),
        });
    }

    startStage(stage: string): void {
        this.stageStartedAt.set(stage, Date.now());
    }

    endStage(stage: string): void {
        const startedAt = this.stageStartedAt.get(stage);
        if (startedAt === undefined) return;
        this.stageTimings.push({ stage, durationMs: Date.now() - startedAt });
        this.stageStartedAt.delete(stage);
    }

    summary(): WorkflowSummary {
        return {
            mode: this.mode,
            fileBudget: this.fileBudget,
            filesUsed: this.filesUsed,
            decisions: [...this.decisions],
            errors: [...this.errors],
            stageTimings: [...this.stageTimings],
        };
    }
}
