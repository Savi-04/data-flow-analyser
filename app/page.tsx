'use client';

import { useState } from 'react';
import { LandingPage } from '@/components/ui/LandingPage';
import { FileTree } from '@/components/ui/FileTree';
import { CodeViewerPane } from '@/components/ui/CodeViewerPane';
import { DataFlowFilter } from '@/components/ui/DataFlowFilter';
import { ComponentSearch } from '@/components/ui/ComponentSearch';
import { ForceGraph } from '@/components/3d/ForceGraph';
import { fetchRepoData } from '@/lib/actions/fetchRepoData';
import { getMockGraphData } from '@/lib/actions/getMockData';
import { analyzeCode } from '@/lib/utils/analyzeCode';
import { GraphData, ComponentNode, FileNode, StateVariable } from '@/types';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function Home() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [stateVariables, setStateVariables] = useState<StateVariable[]>([]);
  const [filteredNodeIds, setFilteredNodeIds] = useState<string[] | null>(null);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<ComponentNode | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repoName, setRepoName] = useState<string>('');

  const handleAnalyze = async (url: string, token?: string) => {
    setIsAnalyzing(true);
    setError(null);

    try {
      // Check if demo mode
      if (url.toLowerCase() === 'demo' || url.toLowerCase() === 'test') {
        setRepoName('Demo Project');
        const mockData = await getMockGraphData();
        setGraphData(mockData);
        setStateVariables([
          { name: 'user', setterName: 'setUser', sourceComponentId: 'src/App', sourceComponentName: 'App', consumers: ['src/components/Header'] },
          { name: 'isLoggedIn', setterName: 'setIsLoggedIn', sourceComponentId: 'src/App', sourceComponentName: 'App', consumers: ['src/components/Header', 'src/components/Footer'] },
        ]);
        setFiles([
          { path: 'src/App.tsx', name: 'App.tsx', type: 'file', content: '// App component' },
          { path: 'src/components/Header.tsx', name: 'Header.tsx', type: 'file', content: '// Header component' },
          { path: 'src/components/Footer.tsx', name: 'Footer.tsx', type: 'file', content: '// Footer component' },
          { path: 'src/hooks/useAuth.ts', name: 'useAuth.ts', type: 'file', content: '// useAuth hook' },
          { path: 'src/utils/api.ts', name: 'api.ts', type: 'file', content: '// API utilities' },
        ]);
        return;
      }

      // Fetch repository data (pass token for private repos)
      const repoData = await fetchRepoData(url, token);

      if (!repoData) {
        throw new Error('Failed to fetch repository data');
      }

      setRepoName(`${repoData.owner}/${repoData.repo}`);
      setFiles(repoData.files);

      // Analyze code
      const analysisResult = analyzeCode(repoData.files);
      setGraphData({ nodes: analysisResult.nodes, links: analysisResult.links });
      setStateVariables(analysisResult.stateVariables);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setGraphData(null);
    setFiles([]);
    setSelectedNode(null);
    setSelectedFile(null);
    setError(null);
    setRepoName('');
    setStateVariables([]);
    setFilteredNodeIds(null);
  };

  const handleNodeSelect = (node: ComponentNode | null) => {
    setSelectedNode(node);
  };

  const handleFilter = (nodeIds: string[] | null) => {
    setFilteredNodeIds(nodeIds);
  };

  // Get file content for selected node
  const getFileContent = (node: ComponentNode | null): string | undefined => {
    if (!node) return undefined;
    const file = files.find(f => f.path === node.filePath);
    return file?.content;
  };

  // Handle node selection - also opens code viewer
  const handleNodeSelect = (node: ComponentNode | null) => {
    setSelectedNode(node);
    if (node) {
      const file = files.find(f => f.path === node.filePath);
      if (file) {
        setSelectedFile(file);
      }
    }
  };

  // Handle file click from tree
  const handleFileClick = (file: FileNode) => {
    setSelectedFile(file);
  };

  // Close code viewer
  const handleCloseCodeViewer = () => {
    setSelectedFile(null);
    setSelectedNode(null);
  };

  // Show landing page if no data
  if (!graphData && !isAnalyzing) {
    return <LandingPage onSubmit={handleAnalyze} />;
  }

  // Show loading state
  if (isAnalyzing) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-void-black">
        <div className="glass p-8 rounded-2xl text-center">
          <Loader2 className="w-16 h-16 text-neon-purple animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-neon-cyan mb-2">Analyzing Repository</h2>
          <p className="text-gray-400">Fetching files and building graph...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-void-black">
        <div className="glass p-8 rounded-2xl text-center max-w-md">
          <h2 className="text-2xl font-bold text-red-500 mb-4">Error</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={handleReset}
            className="glass-cyan px-6 py-3 rounded-lg font-semibold text-neon-cyan hover:bg-neon-cyan/10 transition-all"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Show dashboard
  return (
    <div className="w-full h-screen bg-void-black overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 glass-cyan border-b border-neon-cyan/20">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 text-neon-cyan hover:text-neon-purple transition-colors"
            >
              <ArrowLeft size={20} />
              Back
            </button>
            <div className="h-6 w-px bg-neon-cyan/20" />
            <h1 className="text-xl font-bold text-neon-purple text-glow-purple">
              {repoName}
            </h1>
          </div>

          <div className="flex items-center gap-6">
            {/* Component Search */}
            <ComponentSearch
              nodes={graphData?.nodes || []}
              onSelect={setHighlightedNodeId}
              selectedNodeId={highlightedNodeId}
            />

            {/* Data Flow Filter */}
            <DataFlowFilter
              stateVariables={stateVariables}
              onFilter={handleFilter}
            />

            {/* Legend */}
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-gray-400">Components</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-gray-400">Hooks</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-gray-400">Utils</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex h-full pt-[73px]">
        {/* Left Sidebar - File Tree */}
        <div className="w-80 h-full p-4 border-r border-neon-purple/20 flex-shrink-0">
          <FileTree files={files} onFileClick={handleFileClick} />
        </div>

        {/* Center - 3D Graph */}
        <div className="flex-1 h-full relative min-w-0">
          {graphData && (
            <ForceGraph
              data={graphData}
              onNodeSelect={handleNodeSelect}
              filteredNodeIds={filteredNodeIds}
              highlightedNodeId={highlightedNodeId}
            />
          )}
        </div>

        {/* Right Sidebar - Resizable Code Viewer */}
        <CodeViewerPane
          fileName={selectedFile?.name || null}
          filePath={selectedFile?.path || null}
          content={selectedFile?.content || null}
          onClose={handleCloseCodeViewer}
        />
      </div>

      {/* Stats Footer */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
        <div className="glass px-6 py-3 rounded-full flex items-center gap-6 text-sm">
          <div>
            <span className="text-gray-400">Nodes: </span>
            <span className="text-neon-cyan font-bold">{graphData?.nodes.length || 0}</span>
          </div>
          <div className="w-px h-4 bg-neon-purple/20" />
          <div>
            <span className="text-gray-400">Links: </span>
            <span className="text-neon-purple font-bold">{graphData?.links.length || 0}</span>
          </div>
          <div className="w-px h-4 bg-neon-purple/20" />
          <div>
            <span className="text-gray-400">State Vars: </span>
            <span className="text-neon-pink font-bold">{stateVariables.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
