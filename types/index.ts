export interface FileNode {
    path: string;
    name: string;
    type: 'file' | 'directory';
    content?: string;
}

export interface ComponentNode {
    id: string;
    name: string;
    type: 'component' | 'hook' | 'util';
    filePath: string;
    imports: string[];
    exports: string[];
    usesState: boolean;
    usesEffect: boolean;
    usesProps: boolean;
    complexity: number; // Number of connections
}

export interface GraphLink {
    source: string;
    target: string;
    props?: string[]; // Prop names passed from source to target
}

export interface GraphData {
    nodes: ComponentNode[];
    links: GraphLink[];
}

export interface RepoData {
    owner: string;
    repo: string;
    files: FileNode[];
    /** Present only when the request was analysed in Deep-Dive Agentic mode. */
    deepDive?: DeepDiveResult;
}

export interface StateVariable {
    name: string;
    setterName: string;
    sourceComponentId: string;
    sourceComponentName: string;
    consumers: string[]; // Component IDs that receive this as props
}

export type ArchitecturalPatternKind =
    | 'prop-drilling'
    | 'circular-dependency'
    | 'god-component'
    | 'orphaned-module'
    | 'container-component'
    | 'presentational-component'
    | 'deep-hierarchy';

export type ArchitecturalPatternSeverity = 'info' | 'warning';

export interface ArchitecturalPattern {
    kind: ArchitecturalPatternKind;
    severity: ArchitecturalPatternSeverity;
    /** Component node IDs implicated in this finding. */
    nodeIds: string[];
    description: string;
}

export type AnalysisMode = 'normal' | 'deep-dive';

/** One subtree-exploration choice the agent made during Stage 2, and why. */
export interface AgentDecision {
    path: string;
    reason: string;
    accepted: boolean;
    filesFetched?: number;
}

export interface StageError {
    stage: string;
    message: string;
}

export interface StageTiming {
    stage: string;
    durationMs: number;
}

/** Threaded through every stage of the agentic pipeline; serialized into the
 * API response so context management is inspectable, not just asserted. */
export interface WorkflowSummary {
    mode: AnalysisMode;
    fileBudget: number;
    filesUsed: number;
    decisions: AgentDecision[];
    errors: StageError[];
    stageTimings: StageTiming[];
}

export interface ArchitecturalAssessment {
    summary: string;
    strengths: string[];
    concerns: string[];
}

/**
 * The model's judgement on one deterministic finding. It may only reference
 * findings by their index in the source array and re-order or dismiss them —
 * it never authors a finding, so the detector stays the single source of truth.
 */
export interface PatternTriage {
    /** Index into the `patterns` array this triage was computed from. */
    index: number;
    /** 1 = most worth acting on. */
    rank: number;
    /** Why this matters for this codebase specifically. */
    note: string;
}

export interface DismissedPattern {
    index: number;
    /** Why this is noise rather than a real problem here. */
    note: string;
}

/** Output of the triage stage. Indices are validated against the source array. */
export interface TriageResult {
    significant: PatternTriage[];
    dismissed: DismissedPattern[];
}

/**
 * A group of components the model judged to serve one purpose. Grouping is
 * the judgement call here (real features cross directory boundaries), but
 * every nodeId is validated against the graph, so a cluster can never point
 * at a component that does not exist.
 */
export interface SemanticCluster {
    /** Short human label, e.g. "Authentication flow". */
    label: string;
    /** One sentence on what this group does. */
    purpose: string;
    nodeIds: string[];
}

export interface DeepDiveResult {
    patterns: ArchitecturalPattern[];
    assessment: ArchitecturalAssessment | null;
    /** Null when the triage stage failed or degraded. */
    triage: TriageResult | null;
    /** Empty when the clustering stage failed or found nothing coherent. */
    clusters: SemanticCluster[];
    workflow: WorkflowSummary;
}

