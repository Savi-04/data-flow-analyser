'use client';

import { useState } from 'react';
import {
    ArchitecturalAssessment,
    ArchitecturalPattern,
    ArchitecturalPatternKind,
    SemanticCluster,
    TriageResult,
    WorkflowSummary,
} from '@/types';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Info, Layers, MapPin, Sparkles, Workflow } from 'lucide-react';

interface ArchitectureInsightsProps {
    patterns: ArchitecturalPattern[];
    onLocate: (nodeId: string | null) => void;
    /** The model's written synthesis — absent if Stage 4 failed or degraded. */
    assessment?: ArchitecturalAssessment | null;
    /** Per-stage decisions, timings, and errors — makes "context management
     * across every stage" inspectable rather than asserted. */
    workflow?: WorkflowSummary | null;
    /** The model's ranking of the deterministic findings — absent if that
     * stage failed, in which case findings render unranked as before. */
    triage?: TriageResult | null;
    /** Model-grouped functional areas — empty if that stage failed. */
    clusters?: SemanticCluster[];
}

const KIND_LABELS: Record<ArchitecturalPatternKind, string> = {
    'prop-drilling': 'Prop Drilling',
    'circular-dependency': 'Circular Dependency',
    'god-component': 'God Component',
    'orphaned-module': 'Orphaned Module',
    'container-component': 'Container',
    'presentational-component': 'Presentational',
    'deep-hierarchy': 'Deep Hierarchy',
};

function AgentTrace({ workflow }: { workflow: WorkflowSummary }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="mb-4 border border-black/5 rounded-lg overflow-hidden">
            <button
                onClick={() => setExpanded((v) => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-black/[0.02] hover:bg-black/[0.04] transition-colors"
            >
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Workflow size={14} className="text-neon-purple" />
                <span className="text-xs font-semibold text-gray-800">
                    Agent trace — {workflow.filesUsed}/{workflow.fileBudget} files, {workflow.decisions.length} exploration decision
                    {workflow.decisions.length !== 1 ? 's' : ''}
                </span>
            </button>

            {expanded && (
                <div className="px-3 py-2 space-y-2 border-t border-black/5">
                    {workflow.decisions.length > 0 && (
                        <ul className="space-y-1.5">
                            {workflow.decisions.map((decision, i) => (
                                <li key={i} className="text-xs">
                                    <span className={decision.accepted ? 'text-neon-cyan' : 'text-gray-400'}>
                                        {decision.accepted ? '✓' : '·'} {decision.path}
                                    </span>
                                    <span className="text-gray-500"> — {decision.reason || 'no reason given'}</span>
                                    {decision.accepted && (
                                        <span className="text-gray-400"> ({decision.filesFetched} files)</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}

                    {workflow.stageTimings.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] text-gray-500">
                            {workflow.stageTimings.map((t, i) => (
                                <span key={i}>
                                    {t.stage}: {t.durationMs}ms
                                </span>
                            ))}
                        </div>
                    )}

                    {workflow.errors.length > 0 && (
                        <div className="pt-1 space-y-1">
                            {workflow.errors.map((e, i) => (
                                <p key={i} className="text-[11px] text-amber-700">
                                    ⚠ {e.stage}: {e.message}
                                </p>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function Assessment({ assessment }: { assessment: ArchitecturalAssessment }) {
    return (
        <div className="mb-4 p-3 rounded-lg bg-neon-purple/[0.04] border border-neon-purple/10">
            <p className="text-sm text-gray-800 mb-2">{assessment.summary}</p>

            {assessment.strengths.length > 0 && (
                <div className="mb-2">
                    {assessment.strengths.map((s, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-gray-700 mt-1">
                            <CheckCircle2 size={12} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                            <span>{s}</span>
                        </div>
                    ))}
                </div>
            )}

            {assessment.concerns.length > 0 && (
                <div>
                    {assessment.concerns.map((c, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-gray-700 mt-1">
                            <AlertTriangle size={12} className="text-amber-600 flex-shrink-0 mt-0.5" />
                            <span>{c}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Clusters({ clusters, onLocate }: { clusters: SemanticCluster[]; onLocate: (nodeId: string | null) => void }) {
    return (
        <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
                <Layers size={14} className="text-neon-cyan" />
                <h3 className="text-xs font-semibold text-gray-800 uppercase tracking-wide">Functional Areas</h3>
            </div>
            <div className="space-y-1.5">
                {clusters.map((cluster, i) => (
                    <button
                        key={`${cluster.label}-${i}`}
                        onClick={() => onLocate(cluster.nodeIds[0] ?? null)}
                        className="w-full text-left p-2.5 rounded-lg bg-neon-cyan/[0.04] border border-neon-cyan/15 hover:border-neon-cyan/50 hover:bg-neon-cyan/[0.08] transition-all group"
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-800">{cluster.label}</span>
                            <span className="text-[11px] text-gray-500 flex-shrink-0">
                                {cluster.nodeIds.length} component{cluster.nodeIds.length !== 1 ? 's' : ''}
                            </span>
                            <MapPin
                                size={11}
                                className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                            />
                        </div>
                        {cluster.purpose && <p className="text-xs text-gray-600 mt-0.5">{cluster.purpose}</p>}
                    </button>
                ))}
            </div>
        </div>
    );
}

function PatternCard({
    pattern,
    onLocate,
    rank,
    note,
    muted = false,
}: {
    pattern: ArchitecturalPattern;
    onLocate: (nodeId: string | null) => void;
    rank?: number;
    note?: string;
    muted?: boolean;
}) {
    return (
        <button
            onClick={() => onLocate(pattern.nodeIds[0] ?? null)}
            className={`w-full text-left p-3 rounded-lg border transition-all group ${
                muted
                    ? 'bg-black/[0.01] border-black/5 hover:border-black/15 opacity-70'
                    : 'bg-black/[0.02] border-black/5 hover:border-neon-purple/40 hover:bg-black/[0.04]'
            }`}
        >
            <div className="flex items-start gap-2">
                {rank !== undefined ? (
                    <span className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-neon-purple/15 text-neon-purple text-[10px] font-bold flex items-center justify-center">
                        {rank}
                    </span>
                ) : pattern.severity === 'warning' ? (
                    <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                ) : (
                    <Info size={15} className="text-neon-cyan flex-shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
                            {KIND_LABELS[pattern.kind]}
                        </span>
                        <MapPin
                            size={12}
                            className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        />
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{pattern.description}</p>
                    {note && <p className="text-xs text-neon-purple/90 mt-1 italic">{note}</p>}
                </div>
            </div>
        </button>
    );
}

/** Findings the model judged expected or harmless — collapsed, but kept visible
 *  so a dismissal can always be checked rather than taken on trust. */
function DismissedFindings({
    items,
    onLocate,
}: {
    items: { pattern: ArchitecturalPattern; note: string }[];
    onLocate: (nodeId: string | null) => void;
}) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="mt-3">
            <button
                onClick={() => setExpanded((v) => !v)}
                className="w-full flex items-center gap-2 px-1 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span>
                    {items.length} finding{items.length !== 1 ? 's' : ''} judged expected for this codebase
                </span>
            </button>
            {expanded && (
                <div className="space-y-2 mt-1.5">
                    {items.map(({ pattern, note }, i) => (
                        <PatternCard key={i} pattern={pattern} onLocate={onLocate} note={note} muted />
                    ))}
                </div>
            )}
        </div>
    );
}

export function ArchitectureInsights({
    patterns,
    onLocate,
    assessment,
    workflow,
    triage,
    clusters,
}: ArchitectureInsightsProps) {
    const warnings = patterns.filter((p) => p.severity === 'warning');
    const info = patterns.filter((p) => p.severity === 'info');

    // Triage only ever references findings by index, so resolve against the
    // deterministic array here. If the stage degraded, `triage` is null and
    // the unranked severity ordering below is used exactly as before.
    const ranked = (triage?.significant ?? [])
        .map((t) => ({ triage: t, pattern: patterns[t.index] }))
        .filter((r): r is { triage: typeof r.triage; pattern: ArchitecturalPattern } => Boolean(r.pattern));
    const dismissed = (triage?.dismissed ?? [])
        .map((d) => ({ pattern: patterns[d.index], note: d.note }))
        .filter((d): d is { pattern: ArchitecturalPattern; note: string } => Boolean(d.pattern));

    return (
        <div className="glass rounded-lg p-6 h-full overflow-y-auto">
            <div className="flex items-center gap-2 mb-1">
                <Sparkles size={18} className="text-neon-purple" />
                <h2 className="text-neon-purple font-bold">Architecture Insights</h2>
            </div>
            <p className="text-gray-600 text-xs mb-4">
                {patterns.length === 0
                    ? 'Deterministic graph analysis — no notable structural patterns detected.'
                    : ranked.length > 0
                      ? `${patterns.length} finding${patterns.length !== 1 ? 's' : ''} detected, ${ranked.length} worth acting on. Click one to locate it in the graph.`
                      : `Deterministic graph analysis — ${patterns.length} finding${patterns.length !== 1 ? 's' : ''}. Click one to locate it in the graph.`}
            </p>

            {workflow && <AgentTrace workflow={workflow} />}
            {assessment && <Assessment assessment={assessment} />}
            {clusters && clusters.length > 0 && <Clusters clusters={clusters} onLocate={onLocate} />}

            {patterns.length > 0 &&
                (ranked.length > 0 ? (
                    <div>
                        <div className="space-y-2">
                            {ranked.map(({ triage: t, pattern }) => (
                                <PatternCard
                                    key={`ranked-${t.index}`}
                                    pattern={pattern}
                                    onLocate={onLocate}
                                    rank={t.rank}
                                    note={t.note}
                                />
                            ))}
                        </div>
                        {dismissed.length > 0 && <DismissedFindings items={dismissed} onLocate={onLocate} />}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {[...warnings, ...info].map((pattern, index) => (
                            <PatternCard
                                key={`${pattern.kind}-${pattern.nodeIds.join(',')}-${index}`}
                                pattern={pattern}
                                onLocate={onLocate}
                            />
                        ))}
                    </div>
                ))}
        </div>
    );
}
