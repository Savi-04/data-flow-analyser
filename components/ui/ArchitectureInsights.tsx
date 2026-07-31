'use client';

import { useState } from 'react';
import { ArchitecturalAssessment, ArchitecturalPattern, ArchitecturalPatternKind, WorkflowSummary } from '@/types';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Info, MapPin, Sparkles, Workflow } from 'lucide-react';

interface ArchitectureInsightsProps {
    patterns: ArchitecturalPattern[];
    onLocate: (nodeId: string | null) => void;
    /** The model's written synthesis — absent if Stage 4 failed or degraded. */
    assessment?: ArchitecturalAssessment | null;
    /** Per-stage decisions, timings, and errors — makes "context management
     * across every stage" inspectable rather than asserted. */
    workflow?: WorkflowSummary | null;
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

export function ArchitectureInsights({ patterns, onLocate, assessment, workflow }: ArchitectureInsightsProps) {
    const warnings = patterns.filter((p) => p.severity === 'warning');
    const info = patterns.filter((p) => p.severity === 'info');

    return (
        <div className="glass rounded-lg p-6 h-full overflow-y-auto">
            <div className="flex items-center gap-2 mb-1">
                <Sparkles size={18} className="text-neon-purple" />
                <h2 className="text-neon-purple font-bold">Architecture Insights</h2>
            </div>
            <p className="text-gray-600 text-xs mb-4">
                {patterns.length > 0
                    ? `Deterministic graph analysis — ${patterns.length} finding${patterns.length !== 1 ? 's' : ''}. Click one to locate it in the graph.`
                    : 'Deterministic graph analysis — no notable structural patterns detected.'}
            </p>

            {workflow && <AgentTrace workflow={workflow} />}
            {assessment && <Assessment assessment={assessment} />}

            {patterns.length > 0 && (
                <div className="space-y-2">
                    {[...warnings, ...info].map((pattern, index) => (
                        <button
                            key={`${pattern.kind}-${pattern.nodeIds.join(',')}-${index}`}
                            onClick={() => onLocate(pattern.nodeIds[0] ?? null)}
                            className="w-full text-left p-3 rounded-lg bg-black/[0.02] border border-black/5 hover:border-neon-purple/40 hover:bg-black/[0.04] transition-all group"
                        >
                            <div className="flex items-start gap-2">
                                {pattern.severity === 'warning' ? (
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
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
