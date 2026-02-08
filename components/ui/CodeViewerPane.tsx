'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, File, Maximize2, Minimize2 } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeViewerPaneProps {
    fileName: string | null;
    filePath: string | null;
    content: string | null;
    onClose: () => void;
}

export function CodeViewerPane({ fileName, filePath, content, onClose }: CodeViewerPaneProps) {
    const [width, setWidth] = useState(500);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);

    // Determine language from file extension
    const getLanguage = (path: string | null): string => {
        if (!path) return 'typescript';
        const ext = path.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'js':
            case 'jsx':
                return 'jsx';
            case 'ts':
            case 'tsx':
                return 'tsx';
            case 'css':
                return 'css';
            case 'json':
                return 'json';
            case 'md':
                return 'markdown';
            default:
                return 'typescript';
        }
    };

    // Handle mouse down on resize handle
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        startXRef.current = e.clientX;
        startWidthRef.current = width;
    }, [width]);

    // Handle mouse move during drag
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;

            const deltaX = startXRef.current - e.clientX;
            const newWidth = Math.min(Math.max(startWidthRef.current + deltaX, 300), window.innerWidth - 400);
            setWidth(newWidth);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isDragging]);

    // Toggle collapse
    const toggleCollapse = () => {
        setIsCollapsed(!isCollapsed);
        if (isMaximized) setIsMaximized(false);
    };

    // Toggle maximize
    const toggleMaximize = () => {
        setIsMaximized(!isMaximized);
        if (isCollapsed) setIsCollapsed(false);
    };

    // If no content and collapsed, show minimal button
    if (isCollapsed) {
        return (
            <div className="h-full flex items-center">
                <button
                    onClick={toggleCollapse}
                    className="h-full w-8 flex items-center justify-center bg-black/50 border-l border-neon-cyan/20 hover:bg-neon-purple/20 transition-colors"
                    title="Expand code viewer"
                >
                    <ChevronLeft className="w-4 h-4 text-neon-cyan" />
                </button>
            </div>
        );
    }

    // If no file selected, show placeholder
    if (!content || !fileName) {
        return (
            <div
                ref={containerRef}
                className="h-full flex flex-col border-l border-neon-cyan/20 bg-black/30"
                style={{ width: isMaximized ? '60vw' : width }}
            >
                {/* Resize Handle */}
                <div
                    className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-neon-purple/50 transition-colors z-10"
                    onMouseDown={handleMouseDown}
                    style={{ backgroundColor: isDragging ? 'rgba(191, 0, 255, 0.5)' : 'transparent' }}
                />

                <div className="flex-1 flex items-center justify-center text-gray-500">
                    <div className="text-center">
                        <File className="w-16 h-16 mx-auto mb-4 opacity-30" />
                        <p>Click a file or component to view code</p>
                    </div>
                </div>

                {/* Collapse button */}
                <button
                    onClick={toggleCollapse}
                    className="absolute top-4 left-2 p-1 hover:bg-neon-purple/20 rounded transition-colors"
                    title="Collapse"
                >
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="h-full flex flex-col border-l border-neon-cyan/20 bg-black/30 relative"
            style={{ width: isMaximized ? '60vw' : width }}
        >
            {/* Resize Handle */}
            <div
                className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-neon-purple/50 transition-colors z-10"
                onMouseDown={handleMouseDown}
                style={{ backgroundColor: isDragging ? 'rgba(191, 0, 255, 0.5)' : 'transparent' }}
            />

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neon-cyan/20 bg-black/50 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <File className="w-4 h-4 text-neon-cyan flex-shrink-0" />
                    <div className="min-w-0">
                        <h3 className="text-neon-cyan font-semibold truncate">{fileName}</h3>
                        <p className="text-gray-500 text-xs truncate">{filePath}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={toggleMaximize}
                        className="p-1 hover:bg-neon-purple/20 rounded transition-colors"
                        title={isMaximized ? "Restore" : "Maximize"}
                    >
                        {isMaximized ? (
                            <Minimize2 className="w-4 h-4 text-gray-400" />
                        ) : (
                            <Maximize2 className="w-4 h-4 text-gray-400" />
                        )}
                    </button>
                    <button
                        onClick={toggleCollapse}
                        className="p-1 hover:bg-neon-purple/20 rounded transition-colors"
                        title="Collapse"
                    >
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-red-500/20 rounded transition-colors"
                        title="Close"
                    >
                        <X className="w-4 h-4 text-gray-400 hover:text-red-500" />
                    </button>
                </div>
            </div>

            {/* Code Content */}
            <div
                className="flex-1 overflow-auto"
                style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#bf00ff #0a0a0a'
                }}
            >
                <SyntaxHighlighter
                    language={getLanguage(filePath)}
                    style={vscDarkPlus}
                    customStyle={{
                        margin: 0,
                        padding: '1rem',
                        background: 'transparent',
                        fontSize: '13px',
                        lineHeight: '1.5',
                        minHeight: '100%',
                    }}
                    showLineNumbers
                    lineNumberStyle={{
                        minWidth: '3em',
                        paddingRight: '1em',
                        color: '#4a5568',
                        userSelect: 'none',
                    }}
                    wrapLines
                >
                    {content}
                </SyntaxHighlighter>
            </div>
        </div>
    );
}
