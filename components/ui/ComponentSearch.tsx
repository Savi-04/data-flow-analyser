'use client';

import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';

interface ComponentSearchProps {
    nodes: { id: string; name: string }[];
    onSelect: (nodeId: string | null) => void;
    selectedNodeId: string | null;
}

export function ComponentSearch({ nodes, onSelect, selectedNodeId }: ComponentSearchProps) {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);

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

    return (
        <div className="relative">
            <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm border border-neon-purple/30 rounded-lg px-3 py-2">
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
                    placeholder="Search components..."
                    className="bg-transparent text-sm text-white placeholder-gray-500 outline-none w-36"
                />
                {(selectedNodeId || query) && (
                    <button onClick={handleClear} className="text-gray-400 hover:text-white">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Dropdown suggestions */}
            {isOpen && filteredNodes.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-black/90 backdrop-blur-md border border-neon-purple/30 rounded-lg overflow-hidden z-50 max-h-64 overflow-y-auto">
                    {filteredNodes.map(node => (
                        <button
                            key={node.id}
                            onClick={() => handleSelect(node.id)}
                            className="w-full px-3 py-2 text-left text-sm text-white hover:bg-neon-purple/20 transition-colors"
                        >
                            {node.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
