'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, ArrowRight } from 'lucide-react';

interface ComponentSearchProps {
    nodes: { id: string; name: string }[];
    onSelect: (nodeId: string | null) => void;
    selectedNodeId: string | null;
}

export function ComponentSearch({ nodes, onSelect, selectedNodeId }: ComponentSearchProps) {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
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

    const filteredNodes = useMemo(() => {
        // Show all nodes when query is empty, otherwise filter
        if (!query.trim()) {
            return nodes.slice(0, 15); // Show up to 15 components when empty
        }
        const lowerQuery = query.toLowerCase();
        return nodes.filter(node =>
            node.name.toLowerCase().includes(lowerQuery)
        ).slice(0, 15); // Limit suggestions
    }, [nodes, query]);

    const handleSelect = (nodeId: string) => {
        onSelect(nodeId);
        setQuery('');
        setIsOpen(false);
    };

    const handleClear = () => {
        onSelect(null);
        setQuery('');
    };

    const handleApply = () => {
        if (filteredNodes.length > 0) {
            handleSelect(filteredNodes[0].id);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleApply();
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    return (
        <div className="relative" ref={containerRef}>
            <div className="flex items-center gap-1 sm:gap-2 bg-white/70 backdrop-blur-sm border border-neon-purple/30 rounded-lg px-1.5 sm:px-3 py-2">
                <Search className="w-4 h-4 text-neon-purple" />
                <input
                    type="text"
                    value={selectedNodeId ? nodes.find(n => n.id === selectedNodeId)?.name || query : query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                        if (selectedNodeId) onSelect(null);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search components..."
                    className="bg-transparent text-sm text-gray-900 placeholder-gray-500 outline-none w-8 sm:w-36"
                />
                {query.trim() && !selectedNodeId && (
                    <button
                        type="button"
                        onClick={handleApply}
                        disabled={filteredNodes.length === 0}
                        className="text-neon-purple hover:text-neon-cyan disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                        title="Go to component"
                        aria-label="Go to component"
                    >
                        <ArrowRight className="w-4 h-4" />
                    </button>
                )}
                {(selectedNodeId || query) && (
                    <button onClick={handleClear} className="text-gray-500 hover:text-gray-900 flex-shrink-0" aria-label="Clear search">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Dropdown suggestions — use onMouseDown to fire before onBlur */}
            {isOpen && filteredNodes.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-neon-purple/20 rounded-lg overflow-hidden z-[100] max-h-64 overflow-y-auto shadow-xl">
                    {filteredNodes.map(node => (
                        <button
                            key={node.id}
                            onMouseDown={(e) => {
                                e.preventDefault(); // Prevent input blur from closing dropdown
                                handleSelect(node.id);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-neon-purple/10 transition-colors"
                        >
                            {node.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
