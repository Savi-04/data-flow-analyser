'use client';

import { useState, useEffect } from 'react';
import { LandingPage } from '@/components/ui/LandingPage';
import { FileTree } from '@/components/ui/FileTree';
import { CodeViewerPane } from '@/components/ui/CodeViewerPane';
import { ComponentDetail } from '@/components/ui/ComponentDetail';
import { DataFlowFilter } from '@/components/ui/DataFlowFilter';
import { ComponentSearch } from '@/components/ui/ComponentSearch';
import { ModeSelector } from '@/components/ui/ModeSelector';
import { ArchitectureInsights } from '@/components/ui/ArchitectureInsights';
import { ForceGraph } from '@/components/3d/ForceGraph';
import { getMockGraphData } from '@/lib/actions/getMockData';
import { analyzeCode } from '@/lib/utils/analyzeCode';
import { GraphData, ComponentNode, FileNode, StateVariable, RepoData, AnalysisMode, DeepDiveResult } from '@/types';
import { ArrowLeft, Loader2, PanelLeftClose, PanelLeft, PanelRightClose, PanelRight } from 'lucide-react';

export default function Home() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [stateVariables, setStateVariables] = useState<StateVariable[]>([]);
  const [filteredNodeIds, setFilteredNodeIds] = useState<string[] | null>(null);
  const [activeFlow, setActiveFlow] = useState<StateVariable | null>(null);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<ComponentNode | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repoName, setRepoName] = useState<string>('');
  const [isFileExplorerOpen, setIsFileExplorerOpen] = useState(true);
  const [isCodeViewerOpen, setIsCodeViewerOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<'code' | 'details' | 'insights'>('code');

  // A repo URL that's been submitted but is waiting on a mode choice
  // (Normal vs Deep-Dive) before the actual analysis request fires.
  const [pendingRepo, setPendingRepo] = useState<{ url: string; token?: string } | null>(null);
  const [deepDiveAvailable, setDeepDiveAvailable] = useState(false);
  const [deepDiveResult, setDeepDiveResult] = useState<DeepDiveResult | null>(null);

  // Ask the server whether Deep-Dive can be offered at all — this only ever
  // returns a boolean, never the key itself.
  useEffect(() => {
    fetch('/api/analyze')
      .then((r) => r.json())
      .then((d) => setDeepDiveAvailable(Boolean(d.deepDiveAvailable)))
      .catch(() => setDeepDiveAvailable(false));
  }, []);

  // The Details tab only makes sense while a graph node is selected — fall
  // back to Code the moment selection is cleared (e.g. a plain file click).
  useEffect(() => {
    if (!selectedNode && rightPanelTab === 'details') setRightPanelTab('code');
  }, [selectedNode, rightPanelTab]);

  // Reflow guard (WCAG 1.4.10): auto-collapse the fixed-width side panels on
  // narrow viewports so the layout never needs to scroll horizontally.
  useEffect(() => {
    const applyReflow = () => {
      const narrow = window.innerWidth < 1024;
      setIsFileExplorerOpen(!narrow);
      setIsCodeViewerOpen(!narrow);
    };
    applyReflow();
    window.addEventListener('resize', applyReflow);
    return () => window.removeEventListener('resize', applyReflow);
  }, []);

  const runAnalysis = async (url: string, token: string | undefined, mode: AnalysisMode) => {
    setIsAnalyzing(true);
    setError(null);
    setDeepDiveResult(null);

    try {
      // Check if demo mode
      if (url.toLowerCase() === 'demo' || url.toLowerCase() === 'test') {
        setRepoName('Demo Project');
        const mockData = await getMockGraphData();
        setGraphData(mockData);
        setStateVariables([
          { name: 'user', setterName: 'setUser', sourceComponentId: 'App', sourceComponentName: 'App', consumers: ['Header'] },
          { name: 'isLoggedIn', setterName: 'setIsLoggedIn', sourceComponentId: 'App', sourceComponentName: 'App', consumers: ['Header', 'Footer'] },
        ]);
        setFiles([
          {
            path: 'src/App.tsx', name: 'App.tsx', type: 'file', content: `import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';

export function App() {
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check authentication status on mount
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/status');
      const data = await response.json();
      setUser(data.user);
      setIsLoggedIn(data.isAuthenticated);
    } catch (error) {
      console.error('Auth check failed:', error);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setIsLoggedIn(false);
  };

  return (
    <div className="app">
      <Header user={user} isLoggedIn={isLoggedIn} onLogout={handleLogout} />
      <main>
        <h1>Welcome to Our App</h1>
        {isLoggedIn ? (
          <p>Hello, {user?.name}!</p>
        ) : (
          <p>Please log in to continue.</p>
        )}
      </main>
      <Footer copyright="2024 My Company" />
    </div>
  );
}

export default App;` },
          {
            path: 'src/components/Header.tsx', name: 'Header.tsx', type: 'file', content: `import React from 'react';
import { useAuth } from '../hooks/useAuth';

interface HeaderProps {
  user: User | null;
  isLoggedIn: boolean;
  onLogout: () => void;
}

export function Header({ user, isLoggedIn, onLogout }: HeaderProps) {
  const { logout } = useAuth();

  const handleLogoutClick = () => {
    logout();
    onLogout();
  };

  return (
    <header className="header">
      <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
      </nav>
      <div className="user-section">
        {isLoggedIn ? (
          <>
            <span>Welcome, {user?.name}</span>
            <button onClick={handleLogoutClick}>Logout</button>
          </>
        ) : (
          <a href="/login">Login</a>
        )}
      </div>
    </header>
  );
}` },
          {
            path: 'src/components/Footer.tsx', name: 'Footer.tsx', type: 'file', content: `import React from 'react';

interface FooterProps {
  copyright: string;
}

export function Footer({ copyright }: FooterProps) {
  return (
    <footer className="footer">
      <p>&copy; {copyright}</p>
      <nav>
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
      </nav>
    </footer>
  );
}` },
          {
            path: 'src/hooks/useAuth.ts', name: 'useAuth.ts', type: 'file', content: `import { useState, useEffect } from 'react';
import { api, fetchUser, logout as apiLogout } from '../utils/api';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await fetchUser();
      setUser(userData);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  return { user, loading, logout, refetch: loadUser };
}` },
          {
            path: 'src/utils/api.ts', name: 'api.ts', type: 'file', content: `const API_BASE = '/api';

export const api = {
  get: async (endpoint: string) => {
    const response = await fetch(\`\${API_BASE}\${endpoint}\`);
    return response.json();
  },
  post: async (endpoint: string, data: any) => {
    const response = await fetch(\`\${API_BASE}\${endpoint}\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },
};

export const fetchUser = () => api.get('/user');
export const logout = () => api.post('/auth/logout', {});` },
        ]);
        return;
      }

      // Fetch repository data via API route
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: url, token, mode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch repository data');
      }

      const repoData = data as RepoData;

      setRepoName(`${repoData.owner}/${repoData.repo}`);
      setFiles(repoData.files);

      // Analyze code
      const analysisResult = analyzeCode(repoData.files);
      setGraphData({ nodes: analysisResult.nodes, links: analysisResult.links });
      setStateVariables(analysisResult.stateVariables);

      if (repoData.deepDive) {
        setDeepDiveResult(repoData.deepDive);
        setRightPanelTab('insights');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Landing page submit — demo mode skips the mode picker entirely (it's a
  // fully client-side mock, so "which mode" is meaningless); a real repo
  // URL is held pending until the user picks Normal or Deep-Dive.
  const handleRepoSubmit = async (url: string, token?: string) => {
    if (url.toLowerCase() === 'demo' || url.toLowerCase() === 'test') {
      await runAnalysis(url, token, 'normal');
      return;
    }
    setPendingRepo({ url, token });
  };

  const handleModeSelected = (mode: AnalysisMode) => {
    if (!pendingRepo) return;
    const { url, token } = pendingRepo;
    setPendingRepo(null);
    void runAnalysis(url, token, mode);
  };

  const handleModeCancel = () => setPendingRepo(null);

  const handleReset = () => {
    setGraphData(null);
    setFiles([]);
    setSelectedNode(null);
    setSelectedFile(null);
    setError(null);
    setRepoName('');
    setStateVariables([]);
    setFilteredNodeIds(null);
    setActiveFlow(null);
    setPendingRepo(null);
    setDeepDiveResult(null);
    setRightPanelTab('code');
  };

  const handleFilter = (nodeIds: string[] | null) => {
    setFilteredNodeIds(nodeIds);
    if (!nodeIds) setActiveFlow(null);
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

  // Handle file click from tree — a plain file browse, distinct from
  // selecting a graph node, so it clears any stale node/Details selection.
  const handleFileClick = (file: FileNode) => {
    setSelectedFile(file);
    setSelectedNode(null);
  };

  // Close code viewer
  const handleCloseCodeViewer = () => {
    setSelectedFile(null);
    setSelectedNode(null);
  };

  // Close the Details tab — return to Code without dropping the open file.
  const handleCloseDetails = () => {
    setSelectedNode(null);
  };

  // Show loading state
  if (isAnalyzing) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-void-black">
        <div className="glass p-8 rounded-2xl text-center">
          <Loader2 className="w-16 h-16 text-neon-purple animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-neon-cyan mb-2">Analyzing Repository</h2>
          <p className="text-gray-600">Fetching files and building graph...</p>
        </div>
      </div>
    );
  }

  // Show error state (must be checked BEFORE landing page fallback)
  if (error) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-void-black">
        <div className="glass p-8 rounded-2xl text-center max-w-md">
          <h2 className="text-2xl font-bold text-red-500 mb-4">Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
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

  // A repo has been submitted — ask which mode before spending any quota.
  if (pendingRepo) {
    return (
      <ModeSelector
        repoLabel={pendingRepo.url}
        deepDiveAvailable={deepDiveAvailable}
        onSelect={handleModeSelected}
        onCancel={handleModeCancel}
      />
    );
  }

  // Show landing page if no data
  if (!graphData) {
    return <LandingPage onSubmit={handleRepoSubmit} />;
  }

  // Show dashboard
  return (
    <div className="w-full h-screen bg-void-black overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 glass-cyan border-b border-neon-cyan/20">
        <div className="flex items-center justify-between px-2 sm:px-6 py-4 gap-1 sm:gap-2 min-w-0">
          <div className="flex items-center gap-1 sm:gap-4 min-w-0 flex-shrink-0">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 text-neon-cyan hover:text-neon-purple transition-colors flex-shrink-0"
            >
              <ArrowLeft size={20} />
              <span className="hidden sm:inline">Back</span>
            </button>
            <div className="h-6 w-px bg-neon-cyan/20 hidden sm:block" />
            <h1 className="text-xl font-bold text-neon-purple text-glow-purple truncate max-w-[18vw] sm:max-w-[30vw]">
              {repoName}
            </h1>
          </div>

          <div className="flex items-center gap-1 sm:gap-6 min-w-0 flex-shrink-0">
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
              onFlowSelect={setActiveFlow}
            />

            {/* Legend — also reads as the vertical strata order (top to bottom). Hidden
                below lg: it's supplementary (the graph's own colors already convey this)
                and is the first thing to drop so the header never forces horizontal scroll. */}
            <div className="hidden lg:flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#4338ca' }} />
                <span className="text-gray-600">Components</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#be185d' }} />
                <span className="text-gray-600">Hooks</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#047857' }} />
                <span className="text-gray-600">Utils</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout - Fixed to account for navbar */}
      <div className="absolute inset-0 top-[73px] flex">
        {/* Left Sidebar - File Tree (Collapsible) */}
        {isFileExplorerOpen ? (
          <div className="w-80 h-full p-2 border-r border-neon-purple/20 flex-shrink-0">
            <FileTree
              files={files}
              onFileClick={handleFileClick}
              onCollapse={() => setIsFileExplorerOpen(false)}
            />
          </div>
        ) : (
          <div className="h-full flex-shrink-0 border-r border-neon-purple/20 bg-black/5">
            <button
              onClick={() => setIsFileExplorerOpen(true)}
              className="h-full w-10 flex items-center justify-center hover:bg-neon-purple/20 transition-colors"
              title="Open File Explorer"
            >
              <PanelLeft className="w-4 h-4 text-neon-purple" />
            </button>
          </div>
        )}

        {/* Center - 3D Graph. This section is exempt from WCAG 1.4.10 reflow
            (diagrams inherently require 2D/3D layout) but must never spill a
            scrollbar itself — the WebGL canvas always fills its container. */}
        <div className="flex-1 h-full relative min-w-0 overflow-hidden">
          {graphData && (
            <ForceGraph
              data={graphData}
              onNodeSelect={handleNodeSelect}
              filteredNodeIds={filteredNodeIds}
              highlightedNodeId={highlightedNodeId}
              activeFlow={activeFlow}
            />
          )}
        </div>

        {/* Right Sidebar - Resizable Code Viewer / Node Details (Collapsible) */}
        {isCodeViewerOpen ? (
          <div className="h-full flex-shrink-0 flex flex-col">
            {(selectedNode || deepDiveResult) && (
              <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 bg-white/70 backdrop-blur-sm border-b border-l border-neon-cyan/20">
                {selectedNode && (
                  <>
                    <button
                      onClick={() => setRightPanelTab('code')}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${rightPanelTab === 'code'
                        ? 'bg-neon-cyan/15 text-neon-cyan'
                        : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                      Code
                    </button>
                    <button
                      onClick={() => setRightPanelTab('details')}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${rightPanelTab === 'details'
                        ? 'bg-neon-purple/15 text-neon-purple'
                        : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                      Details
                    </button>
                  </>
                )}
                {deepDiveResult && (
                  <button
                    onClick={() => setRightPanelTab('insights')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${rightPanelTab === 'insights'
                      ? 'bg-neon-purple/15 text-neon-purple'
                      : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    Insights
                  </button>
                )}
              </div>
            )}

            {rightPanelTab === 'insights' && deepDiveResult ? (
              <div className="flex-1 min-h-0 w-[500px] border-l border-neon-cyan/20 bg-white/30">
                <ArchitectureInsights
                  patterns={deepDiveResult.patterns}
                  onLocate={setHighlightedNodeId}
                  assessment={deepDiveResult.assessment}
                  workflow={deepDiveResult.workflow}
                />
              </div>
            ) : rightPanelTab === 'details' && selectedNode ? (
              <div className="flex-1 min-h-0 w-[500px] border-l border-neon-cyan/20 bg-white/30">
                <ComponentDetail
                  node={selectedNode}
                  onClose={handleCloseDetails}
                  fileContent={getFileContent(selectedNode)}
                />
              </div>
            ) : (
              <div className="flex-1 min-h-0">
                <CodeViewerPane
                  fileName={selectedFile?.name || null}
                  filePath={selectedFile?.path || null}
                  content={selectedFile?.content || null}
                  onClose={() => setIsCodeViewerOpen(false)}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex-shrink-0 border-l border-neon-cyan/20 bg-black/5">
            <button
              onClick={() => setIsCodeViewerOpen(true)}
              className="h-full w-10 flex items-center justify-center hover:bg-neon-cyan/20 transition-colors"
              title="Open Code Viewer"
            >
              <PanelRight className="w-4 h-4 text-neon-cyan" />
            </button>
          </div>
        )}
      </div>

      {/* Stats Footer */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
        <div className="glass px-6 py-3 rounded-full flex items-center gap-6 text-sm">
          <div>
            <span className="text-gray-600">Nodes: </span>
            <span className="text-neon-cyan font-bold">{graphData?.nodes.length || 0}</span>
          </div>
          <div className="w-px h-4 bg-neon-purple/20" />
          <div>
            <span className="text-gray-600">Links: </span>
            <span className="text-neon-purple font-bold">{graphData?.links.length || 0}</span>
          </div>
          <div className="w-px h-4 bg-neon-purple/20" />
          <div>
            <span className="text-gray-600">State Vars: </span>
            <span className="text-neon-pink font-bold">{stateVariables.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
