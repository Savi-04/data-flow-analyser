'use client';

import { FileNode } from '@/types';
import { File, Folder, ChevronRight, ChevronDown, PanelLeftClose } from 'lucide-react';
import { useState, createContext, useContext } from 'react';

interface FileTreeProps {
    files: FileNode[];
    onFileClick?: (file: FileNode) => void;
    onCollapse?: () => void;
}

interface TreeNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children: TreeNode[];
}

// Context to pass file click handler down
const FileClickContext = createContext<((path: string) => void) | null>(null);

function buildTree(files: FileNode[]): TreeNode[] {
    const root: TreeNode[] = [];
    const map = new Map<string, TreeNode>();

    files.forEach((file) => {
        const parts = file.path.split('/');
        let currentPath = '';

        parts.forEach((part, index) => {
            const parentPath = currentPath;
            currentPath = currentPath ? `${currentPath}/${part}` : part;

            if (!map.has(currentPath)) {
                const node: TreeNode = {
                    name: part,
                    path: currentPath,
                    type: index === parts.length - 1 ? file.type : 'directory',
                    children: [],
                };

                map.set(currentPath, node);

                if (parentPath) {
                    const parent = map.get(parentPath);
                    if (parent) {
                        parent.children.push(node);
                    }
                } else {
                    root.push(node);
                }
            }
        });
    });

    return root;
}

function TreeItem({ node }: { node: TreeNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const hasChildren = node.children.length > 0;
    const onFileClick = useContext(FileClickContext);

    const handleClick = () => {
        if (hasChildren) {
            setIsOpen(!isOpen);
        } else if (node.type === 'file' && onFileClick) {
            onFileClick(node.path);
        }
    };

    return (
        <div>
            <div
                className={`flex items-center gap-2 px-3 py-2 hover:bg-neon-purple/10 cursor-pointer rounded transition-colors ${node.type === 'file' ? 'hover:bg-neon-cyan/10' : ''
                    }`}
                onClick={handleClick}
            >
                {hasChildren && (
                    <span className="text-neon-cyan">
                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                )}
                {!hasChildren && <span className="w-4" />}

                {node.type === 'directory' ? (
                    <Folder size={16} className="text-neon-purple" />
                ) : (
                    <File size={16} className="text-neon-cyan" />
                )}

                <span className="text-sm text-gray-300 truncate">{node.name}</span>
            </div>

            {hasChildren && isOpen && (
                <div className="ml-4 border-l border-neon-purple/20">
                    {node.children.map((child) => (
                        <TreeItem key={child.path} node={child} />
                    ))}
                </div>
            )}
        </div>
    );
}

export function FileTree({ files, onFileClick, onCollapse }: FileTreeProps) {
    const tree = buildTree(files);

    const handleFileClick = (path: string) => {
        if (onFileClick) {
            const file = files.find(f => f.path === path);
            if (file) {
                onFileClick(file);
            }
        }
    };

    return (
        <FileClickContext.Provider value={handleFileClick}>
            <div className="h-full rounded-lg flex flex-col bg-black/40 backdrop-blur-md border border-neon-purple/20">
                {/* Fixed Header - Always Visible */}
                <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-neon-purple/30 bg-black/60">
                    <h2 className="text-neon-purple font-bold text-base text-glow-purple">
                        File Explorer
                    </h2>
                    {onCollapse && (
                        <button
                            onClick={onCollapse}
                            className="p-2 bg-neon-purple/20 hover:bg-neon-purple/40 rounded-md transition-colors border border-neon-purple/40"
                            title="Collapse File Explorer"
                        >
                            <PanelLeftClose className="w-5 h-5 text-neon-purple" />
                        </button>
                    )}
                </div>
                {/* Scrollable Content */}
                <div
                    className="flex-1 overflow-auto px-3 py-2 min-h-0"
                    style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#bf00ff #0a0a0a'
                    }}
                >
                    <div className="min-w-max space-y-0.5">
                        {tree.map((node) => (
                            <TreeItem key={node.path} node={node} />
                        ))}
                    </div>
                </div>
            </div>
        </FileClickContext.Provider>
    );
}
