'use client';

import { useState, useRef, useEffect } from 'react';
import { StateVariable } from '@/types';
import { ChevronDown, Filter, X, Database } from 'lucide-react';

interface DataFlowFilterProps {
    stateVariables: StateVariable[];
    onFilter: (filteredNodeIds: string[] | null) => void;
    onFlowSelect?: (variable: StateVariable | null) => void;
}

export function DataFlowFilter({ stateVariables, onFilter, onFlowSelect }: DataFlowFilterProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedVariable, setSelectedVariable] = useState<StateVariable | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (variable: StateVariable | null) => {
        setSelectedVariable(variable);
        setIsOpen(false);
        onFlowSelect?.(variable);

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
        onFlowSelect?.(null);
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
        <div className="relative flex items-center" ref={containerRef}>
            {/* Dropdown trigger */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-2 sm:px-4 py-2 bg-white/70 backdrop-blur-sm rounded-lg text-sm hover:bg-black/[0.03] transition-all border border-neon-purple/30 flex-shrink-0"
                aria-label="Filter by state"
            >
                <Database size={16} className="text-neon-purple" />
                <span className="text-gray-700 hidden sm:inline">
                    {selectedVariable ? (
                        <span className="text-neon-cyan">{selectedVariable.name}</span>
                    ) : (
                        'Filter by State'
                    )}
                </span>
                <ChevronDown
                    size={16}
                    className={`text-gray-500 transition-transform hidden sm:inline ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Clear button */}
            {selectedVariable && (
                <button
                    onClick={handleClear}
                    className="ml-2 p-2 bg-white/70 backdrop-blur-sm rounded-lg hover:bg-red-50 transition-all border border-red-300"
                    title="Clear filter"
                >
                    <X size={14} className="text-red-500" />
                </button>
            )}

            {/* Dropdown menu — solid background, no backdrop-blur to avoid stacking context issues */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-lg border border-neon-purple/20 shadow-xl z-[100] max-h-80 overflow-y-auto">
                    {/* Header */}
                    <div className="px-4 py-2 border-b border-neon-purple/10">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Filter size={14} />
                            <span>Select a state variable to filter</span>
                        </div>
                    </div>

                    {/* Show all option */}
                    <button
                        onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelect(null);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-black/[0.03] transition-colors border-b border-neon-purple/10"
                    >
                        <span className="text-gray-700">Show All Components</span>
                    </button>

                    {/* Grouped variables */}
                    {Object.entries(groupedVariables).map(([componentName, variables]) => (
                        <div key={componentName}>
                            <div className="px-4 py-2 text-xs text-gray-500 bg-black/[0.03] uppercase tracking-wider">
                                {componentName}
                            </div>
                            {variables.map((variable) => (
                                <button
                                    key={`${variable.sourceComponentId}-${variable.name}`}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleSelect(variable);
                                    }}
                                    className={`w-full px-4 py-3 text-left hover:bg-black/[0.03] transition-colors flex items-center justify-between ${selectedVariable?.name === variable.name ? 'bg-neon-purple/10' : ''
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
