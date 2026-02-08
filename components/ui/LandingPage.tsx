'use client';

import { useState } from 'react';
import { Search, Github, Key, ChevronDown, ChevronUp } from 'lucide-react';
import { ParticleField } from './ParticleField';

interface LandingPageProps {
    onSubmit: (url: string, token?: string) => void;
}

export function LandingPage({ onSubmit }: LandingPageProps) {
    const [url, setUrl] = useState('');
    const [token, setToken] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url.trim()) return;

        setIsLoading(true);
        await onSubmit(url, token || undefined);
        setIsLoading(false);
    };

    return (
        <div className="relative w-full h-screen flex items-center justify-center overflow-hidden">
            <ParticleField />

            <div className="relative z-10 w-full max-w-2xl px-6">
                {/* Title */}
                <div className="text-center mb-12">
                    <h1 className="text-6xl font-bold mb-4 text-glow-purple">
                        <span className="bg-gradient-to-r from-neon-purple to-neon-cyan bg-clip-text text-transparent">
                            React Repo X-Ray
                        </span>
                    </h1>
                    <p className="text-gray-400 text-lg">
                        Visualize your React codebase as a 3D constellation
                    </p>
                </div>

                {/* Input Form */}
                <form onSubmit={handleSubmit} className="relative">
                    <div className="glass rounded-2xl p-8 animate-glow">
                        {/* URL Input */}
                        <div className="flex items-center gap-4">
                            <Github className="text-neon-purple w-6 h-6" />
                            <input
                                type="text"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="Enter GitHub repository URL..."
                                className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-lg"
                                disabled={isLoading}
                            />
                            <button
                                type="submit"
                                disabled={isLoading || !url.trim()}
                                className="glass-cyan px-6 py-3 rounded-lg font-semibold text-neon-cyan hover:bg-neon-cyan/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin" />
                                        Analyzing...
                                    </>
                                ) : (
                                    <>
                                        <Search className="w-5 h-5" />
                                        Analyze
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Advanced Options Toggle */}
                        <button
                            type="button"
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="flex items-center gap-2 text-gray-500 hover:text-neon-cyan transition-colors mt-4 text-sm"
                        >
                            {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            Advanced Options (Private Repos)
                        </button>

                        {/* Token Input (Collapsible) */}
                        {showAdvanced && (
                            <div className="mt-4 pt-4 border-t border-neon-purple/20">
                                <div className="flex items-center gap-4">
                                    <Key className="text-neon-cyan w-5 h-5" />
                                    <input
                                        type="password"
                                        value={token}
                                        onChange={(e) => setToken(e.target.value)}
                                        placeholder="GitHub Personal Access Token (optional)"
                                        className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-sm"
                                        disabled={isLoading}
                                    />
                                </div>
                                <p className="text-gray-600 text-xs mt-2 ml-9">
                                    🔒 Required for private repos. Token is not stored.
                                </p>
                            </div>
                        )}
                    </div>
                </form>

                {/* Example URLs */}
                <div className="mt-8 text-center">
                    <p className="text-gray-500 text-sm mb-3">Try these examples:</p>
                    <div className="flex flex-wrap justify-center gap-3">
                        <button
                            onClick={() => setUrl('demo')}
                            className="glass-cyan px-4 py-2 rounded-lg text-sm text-neon-cyan hover:bg-neon-cyan/10 transition-all font-semibold"
                        >
                            🎮 Demo Mode
                        </button>
                        {[
                            'facebook/react',
                            'vercel/next.js',
                            'remix-run/react-router',
                        ].map((example) => (
                            <button
                                key={example}
                                onClick={() => setUrl(`https://github.com/${example}`)}
                                className="glass px-4 py-2 rounded-lg text-sm text-neon-purple hover:bg-neon-purple/10 transition-all"
                            >
                                {example}
                            </button>
                        ))}
                    </div>
                    <p className="text-gray-600 text-xs mt-3">
                        💡 Tip: Type "demo" to see a sample visualization
                    </p>
                </div>

                {/* Features */}
                <div className="mt-16 grid grid-cols-3 gap-6">
                    {[
                        { icon: '🔍', title: 'Deep Analysis', desc: 'Scans all React files' },
                        { icon: '🌌', title: '3D Visualization', desc: 'Interactive graph' },
                        { icon: '🔐', title: 'Private Repos', desc: 'With GitHub token' },
                    ].map((feature) => (
                        <div key={feature.title} className="glass p-4 rounded-lg text-center">
                            <div className="text-3xl mb-2">{feature.icon}</div>
                            <h3 className="text-neon-cyan font-semibold mb-1">{feature.title}</h3>
                            <p className="text-gray-500 text-sm">{feature.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
