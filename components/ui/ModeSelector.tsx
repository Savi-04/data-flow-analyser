'use client';

import { Sparkles, Zap } from 'lucide-react';
import { AnalysisMode } from '@/types';

interface ModeSelectorProps {
    repoLabel: string;
    deepDiveAvailable: boolean;
    onSelect: (mode: AnalysisMode) => void;
    onCancel: () => void;
}

export function ModeSelector({ repoLabel, deepDiveAvailable, onSelect, onCancel }: ModeSelectorProps) {
    return (
        <div className="w-full h-screen flex items-center justify-center bg-void-black px-4">
            <div className="glass rounded-3xl p-8 md:p-10 max-w-2xl w-full">
                <p className="text-sm text-gray-500 mb-1 truncate">{repoLabel}</p>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose an analysis mode</h2>
                <p className="text-gray-600 mb-8">
                    Deep-Dive uses an AI agent to explore the repo and detect architectural patterns. Normal is instant and uses no API quota.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => onSelect('normal')}
                        className="text-left p-6 rounded-2xl border-2 border-neon-cyan/30 hover:border-neon-cyan transition-all bg-black/[0.02]"
                    >
                        <Zap className="text-neon-cyan mb-3" size={28} />
                        <h3 className="font-bold text-gray-900 mb-1">Normal</h3>
                        <p className="text-sm text-gray-600">Fast static analysis and the 3D dependency graph.</p>
                    </button>

                    <button
                        onClick={() => deepDiveAvailable && onSelect('deep-dive')}
                        disabled={!deepDiveAvailable}
                        title={deepDiveAvailable ? undefined : 'Requires a configured Gemini API key on the server'}
                        className={`text-left p-6 rounded-2xl border-2 transition-all bg-black/[0.02] ${deepDiveAvailable
                            ? 'border-neon-purple/30 hover:border-neon-purple'
                            : 'border-black/10 opacity-50 cursor-not-allowed'
                            }`}
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <Sparkles className="text-neon-purple" size={28} />
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neon-purple/15 text-neon-purple uppercase tracking-wide">
                                Beta
                            </span>
                        </div>
                        <h3 className="font-bold text-gray-900 mb-1">Deep-Dive Agentic Insights</h3>
                        <p className="text-sm text-gray-600">
                            {deepDiveAvailable
                                ? 'An AI agent explores the codebase and surfaces architectural patterns.'
                                : 'Requires a configured Gemini API key on the server.'}
                        </p>
                    </button>
                </div>

                <button onClick={onCancel} className="mt-6 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                    Cancel
                </button>
            </div>
        </div>
    );
}
