'use client';

import { useState } from 'react';
import { StateVariable } from '@/types';
import { ChevronDown, Filter, X, Database } from 'lucide-react';

interface DataFlowFilterProps {
    stateVariables: StateVariable[];
    onFilter: (filteredNodeIds: string[] | null) => void;
}

export function DataFlowFilter({ stateVariables, onFilter }: DataFlowFilterProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedVariable, setSelectedVariable] = useState<StateVariable | null>(null);

    const handleSelect = (variable: StateVariable | null) => {
        setSelectedVariable(variable);
        setIsOpen(false);

        if (!variable) {
            onFilter(null); // Show all nodes
            return;
        }

        // Get all nodes involved in this data flow
        const filteredIds = [variable.sourceComponentId, ...variable.consumers];
        onFilter(filteredIds);
    };

    const handleClear = () => {
        setSelectedVariable(null);
        onFilter(null);
    };

    // Group variables by source component
    const groupedVariables = stateVariables.reduce((acc, variable) => {
        const key = variable.sourceComponentName;
        if (!acc[key]) acc[key] = [];
        acc[key].push(variable);
        return acc;
    }, {} as Record<string, StateVariable[]>);

    if (stateVariables.length === 0) {
        return null;
    }

    return (
        <div className="relative">
            {/* Dropdown trigger */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-2 glass rounded-lg text-sm hover:bg-white/5 transition-all border border-neon-purple/30"
            >
                <Database size={16} className="text-neon-purple" />
                <span className="text-gray-300">
                    {selectedVariable ? (
                        <span className="text-neon-cyan">{selectedVariable.name}</span>
                    ) : (
                        'Filter by State'
                    )}
                </span>
                <ChevronDown
                    size={16}
                    className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Clear button */}
            {selectedVariable && (
                <button
                    onClick={handleClear}
                    className="ml-2 p-2 glass rounded-lg hover:bg-red-500/20 transition-all border border-red-500/30"
                    title="Clear filter"
                >
                    <X size={14} className="text-red-400" />
                </button>
            )}

            {/* Dropdown menu */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-72 glass rounded-lg border border-neon-purple/30 shadow-2xl z-50 max-h-80 overflow-y-auto">
                    {/* Header */}
                    <div className="px-4 py-2 border-b border-neon-purple/20">
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <Filter size={14} />
                            <span>Select a state variable to filter</span>
                        </div>
                    </div>

                    {/* Show all option */}
                    <button
                        onClick={() => handleSelect(null)}
                        className="w-full px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-neon-purple/10"
                    >
                        <span className="text-gray-300">Show All Components</span>
                    </button>

                    {/* Grouped variables */}
                    {Object.entries(groupedVariables).map(([componentName, variables]) => (
                        <div key={componentName}>
                            <div className="px-4 py-2 text-xs text-gray-500 bg-black/20 uppercase tracking-wider">
                                {componentName}
                            </div>
                            {variables.map((variable) => (
                                <button
                                    key={`${variable.sourceComponentId}-${variable.name}`}
                                    onClick={() => handleSelect(variable)}
                                    className={`w-full px-4 py-3 text-left hover:bg-white/5 transition-colors flex items-center justify-between ${selectedVariable?.name === variable.name ? 'bg-neon-purple/10' : ''
                                        }`}
                                >
                                    <div>
                                        <span className="text-neon-cyan font-mono">{variable.name}</span>
                                        <span className="text-gray-500 text-sm ml-2">
                                            ({variable.setterName})
                                        </span>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        {variable.consumers.length} consumer{variable.consumers.length !== 1 ? 's' : ''}
                                    </span>
                                </button>
                            ))}
                        </div>
                    ))}

                    {stateVariables.length === 0 && (
                        <div className="px-4 py-6 text-center text-gray-500 text-sm">
                            No useState variables detected
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
