'use client';

import { ComponentNode } from '@/types';
import { X, Code2, Zap, Box } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ComponentDetailProps {
    node: ComponentNode | null;
    onClose: () => void;
    fileContent?: string;
}

export function ComponentDetail({ node, onClose, fileContent }: ComponentDetailProps) {
    if (!node) return null;

    const getTypeIcon = () => {
        switch (node.type) {
            case 'component':
                return <Box className="text-blue-500" />;
            case 'hook':
                return <Zap className="text-red-500" />;
            case 'util':
                return <Code2 className="text-green-500" />;
        }
    };

    const getTypeColor = () => {
        switch (node.type) {
            case 'component':
                return 'text-blue-500';
            case 'hook':
                return 'text-red-500';
            case 'util':
                return 'text-green-500';
        }
    };

    return (
        <div className="glass h-full rounded-lg p-6 overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                    {getTypeIcon()}
                    <div>
                        <h2 className="text-neon-cyan font-bold text-2xl text-glow-cyan">
                            {node.name}
                        </h2>
                        <p className={`text-sm ${getTypeColor()} capitalize`}>
                            {node.type}
                        </p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-neon-purple transition-colors"
                >
                    <X size={24} />
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="glass-cyan p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Connections</p>
                    <p className="text-neon-cyan text-2xl font-bold">{node.complexity}</p>
                </div>
                <div className="glass-cyan p-4 rounded-lg">
                    <p className="text-gray-400 text-sm">Exports</p>
                    <p className="text-neon-cyan text-2xl font-bold">{node.exports.length}</p>
                </div>
            </div>

            {/* Features */}
            <div className="mb-6">
                <h3 className="text-neon-purple font-semibold mb-3">Features</h3>
                <div className="flex flex-wrap gap-2">
                    {node.usesState && (
                        <span className="px-3 py-1 bg-neon-purple/20 text-neon-purple rounded-full text-sm">
                            useState
                        </span>
                    )}
                    {node.usesEffect && (
                        <span className="px-3 py-1 bg-neon-cyan/20 text-neon-cyan rounded-full text-sm">
                            useEffect
                        </span>
                    )}
                    {node.usesProps && (
                        <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">
                            Props
                        </span>
                    )}
                    {!node.usesState && !node.usesEffect && !node.usesProps && (
                        <span className="text-gray-500 text-sm">No special features detected</span>
                    )}
                </div>
            </div>

            {/* File Path */}
            <div className="mb-6">
                <h3 className="text-neon-purple font-semibold mb-2">File Path</h3>
                <code className="text-gray-400 text-sm bg-black/50 px-3 py-2 rounded block">
                    {node.filePath}
                </code>
            </div>

            {/* Exports */}
            {node.exports.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-neon-purple font-semibold mb-2">Exports</h3>
                    <div className="flex flex-wrap gap-2">
                        {node.exports.map((exp) => (
                            <span
                                key={exp}
                                className="px-3 py-1 bg-neon-cyan/10 text-neon-cyan rounded text-sm font-mono"
                            >
                                {exp}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Code Preview */}
            {fileContent && (
                <div className="mb-6">
                    <h3 className="text-neon-purple font-semibold mb-3">Code Preview</h3>
                    <div className="rounded-lg overflow-hidden border border-neon-purple/20">
                        <SyntaxHighlighter
                            language="typescript"
                            style={vscDarkPlus}
                            customStyle={{
                                margin: 0,
                                padding: '1rem',
                                background: 'rgba(0, 0, 0, 0.5)',
                                fontSize: '0.875rem',
                            }}
                            showLineNumbers
                        >
                            {fileContent.slice(0, 1000) + (fileContent.length > 1000 ? '\n...' : '')}
                        </SyntaxHighlighter>
                    </div>
                </div>
            )}
        </div>
    );
}
