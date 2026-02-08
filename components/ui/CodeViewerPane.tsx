'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, File, Maximize2, Minimize2, PanelRightClose } from 'lucide-react';
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

    // Toggle maximize
    const toggleMaximize = () => {
        setIsMaximized(!isMaximized);
    };

    return (
        <div
            ref={containerRef}
            className="h-full flex flex-col border-l border-neon-cyan/20 bg-black/30 relative flex-shrink-0"
            style={{ width: isMaximized ? '60vw' : width }}
        >
            {/* Resize Handle */}
            <div
                className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-neon-purple/50 transition-colors z-10"
                onMouseDown={handleMouseDown}
                style={{ backgroundColor: isDragging ? 'rgba(191, 0, 255, 0.5)' : 'transparent' }}
            />

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neon-cyan/20 bg-black/50 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <File className="w-4 h-4 text-neon-cyan flex-shrink-0" />
                    <div className="min-w-0">
                        <h3 className="text-neon-cyan font-semibold truncate">
                            {fileName || 'Code Viewer'}
                        </h3>
                        <p className="text-gray-500 text-xs truncate">
                            {filePath || 'Click a file or component'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                        onClick={toggleMaximize}
                        className="p-1.5 hover:bg-neon-purple/20 rounded transition-colors"
                        title={isMaximized ? "Restore" : "Maximize"}
                    >
                        {isMaximized ? (
                            <Minimize2 className="w-4 h-4 text-gray-400" />
                        ) : (
                            <Maximize2 className="w-4 h-4 text-gray-400" />
                        )}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
                        title="Close Code Viewer"
                    >
                        <PanelRightClose className="w-4 h-4 text-gray-400 hover:text-red-400" />
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
                {content ? (
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
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-500 h-full">
                        <div className="text-center p-8">
                            <File className="w-16 h-16 mx-auto mb-4 opacity-30" />
                            <p>Click a file or component to view code</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
