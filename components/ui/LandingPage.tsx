'use client';

import { useState } from 'react';
import { Search, Github, Key, ChevronDown, ChevronUp, Sparkles, Zap, Lock } from 'lucide-react';
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
        <div className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden py-16">
            <ParticleField />

            {/* Main Content Container */}
            <div className="relative z-10 w-full max-w-3xl px-8">

                {/* Hero Section */}
                <div className="text-center mb-20">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neon-purple/10 border border-neon-purple/30 mb-8">
                        <Sparkles className="w-5 h-5 text-neon-purple" />
                        <span className="text-sm font-medium text-neon-purple">3D Code Visualization</span>
                    </div>

                    {/* Main Title */}
                    <h1 className="text-6xl md:text-7xl font-black mb-8 leading-tight">
                        <span className="block bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
                            React Repo
                        </span>
                        <span className="block bg-gradient-to-r from-neon-purple via-pink-500 to-neon-cyan bg-clip-text text-transparent text-glow-purple">
                            X-Ray
                        </span>
                    </h1>

                    {/* Subtitle */}
                    <p className="text-xl md:text-2xl text-gray-400 font-light max-w-xl leading-relaxed text-center" style={{ margin: 'auto' }}>
                        Transform your React codebase into an
                        <span className="text-neon-cyan font-medium"> interactive 3D constellation</span>
                    </p>
                </div>

                {/* Search Card */}
                <div className="relative mb-16">
                    {/* Glow effect behind card */}
                    <div className="absolute inset-0 bg-gradient-to-r from-neon-purple/20 to-neon-cyan/20 blur-3xl rounded-3xl" />

                    <form onSubmit={handleSubmit} className="relative">
                        <div className="glass rounded-3xl p-8 md:p-10 border border-white/10 shadow-2xl">
                            {/* URL Input */}
                            <div className="flex items-center gap-4 bg-black/30 rounded-2xl p-4 mb-6">
                                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-neon-purple/10 flex items-center justify-center border border-neon-purple/30">
                                    <Github className="text-neon-purple w-6 h-6" />
                                </div>
                                <input
                                    type="text"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder="Paste GitHub repository URL..."
                                    className="flex-1 bg-transparent text-white text-lg placeholder-gray-500 outline-none font-light min-w-0"
                                    disabled={isLoading}
                                />
                            </div>

                            {/* Analyze Button - Full Width */}
                            <button
                                type="submit"
                                disabled={isLoading || !url.trim()}
                                className="w-full px-8 py-4 rounded-2xl font-bold hover:opacity-90 transition-all disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg shadow-lg shadow-neon-purple/30"
                                style={{
                                    background: (isLoading || !url.trim())
                                        ? 'linear-gradient(to right, rgba(191, 0, 255, 0.4), rgba(0, 243, 255, 0.4))'
                                        : 'linear-gradient(to right, #bf00ff, #00f3ff)',
                                    color: (isLoading || !url.trim()) ? 'rgba(255,255,255,0.7)' : '#000',
                                    border: (isLoading || !url.trim()) ? '2px solid rgba(191, 0, 255, 0.5)' : '2px solid transparent',
                                }}
                            >
                                {isLoading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                        <span>Analyzing Repository...</span>
                                    </>
                                ) : (
                                    <>
                                        <Search className="w-6 h-6" />
                                        <span>Analyze Repository</span>
                                    </>
                                )}
                            </button>

                            {/* Advanced Options */}
                            <div className="mt-8 pt-6 border-t border-white/5">
                                <button
                                    type="button"
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                    className="flex items-center gap-2 text-gray-500 hover:text-neon-cyan transition-colors text-sm font-medium"
                                >
                                    {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    <Lock size={18} />
                                    <span>Private Repository Access</span>
                                </button>

                                {showAdvanced && (
                                    <div className="mt-6 flex items-center gap-4 bg-black/30 rounded-xl p-4">
                                        <Key className="text-neon-cyan w-6 h-6 flex-shrink-0" />
                                        <input
                                            type="password"
                                            value={token}
                                            onChange={(e) => setToken(e.target.value)}
                                            placeholder="GitHub Personal Access Token"
                                            className="flex-1 bg-transparent text-white placeholder-gray-600 outline-none text-base"
                                            disabled={isLoading}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </form>
                </div>

                {/* Quick Start Section */}
                <div className="text-center mb-20">
                    <p className="text-gray-500 text-sm uppercase tracking-widest mb-6 font-medium">Quick Start</p>
                    <div className="flex flex-wrap justify-center gap-4">
                        <button
                            onClick={() => setUrl('demo')}
                            className="group relative px-6 py-3 rounded-2xl bg-gradient-to-r from-neon-cyan/20 to-neon-purple/20 border border-neon-cyan/30 hover:border-neon-cyan/60 transition-all"
                        >
                            <span className="flex items-center gap-2 text-neon-cyan font-semibold">
                                <Zap className="w-5 h-5" />
                                Demo Mode
                            </span>
                        </button>
                        {[
                            { name: 'facebook/react', label: 'React' },
                            { name: 'vercel/next.js', label: 'Next.js' },
                        ].map((example) => (
                            <button
                                key={example.name}
                                onClick={() => setUrl(`https://github.com/${example.name}`)}
                                className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 hover:border-neon-purple/50 hover:bg-white/10 transition-all text-gray-300 hover:text-white font-medium"
                            >
                                {example.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Features Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                        {
                            icon: <Search className="w-6 h-6" />,
                            title: 'Deep Analysis',
                            desc: 'Scans all React components, hooks, and utilities',
                            iconClass: 'bg-neon-purple/10 text-neon-purple'
                        },
                        {
                            icon: <Sparkles className="w-6 h-6" />,
                            title: '3D Visualization',
                            desc: 'Interactive force-directed graph in 3D space',
                            iconClass: 'bg-neon-cyan/10 text-neon-cyan'
                        },
                        {
                            icon: <Lock className="w-6 h-6" />,
                            title: 'Private Repos',
                            desc: 'Secure access with GitHub personal token',
                            iconClass: 'bg-pink-500/10 text-pink-500'
                        },
                    ].map((feature) => (
                        <div
                            key={feature.title}
                            className="group p-8 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/20 hover:bg-white/[0.05] transition-all duration-300"
                        >
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform ${feature.iconClass}`}>
                                {feature.icon}
                            </div>
                            <h3 className="text-white font-semibold text-lg mb-2">{feature.title}</h3>
                            <p className="text-gray-500 text-sm leading-relaxed">{feature.desc}</p>
                        </div>
                    ))}
                </div>

                {/* Footer hint */}
                <div className="mt-16 text-center">
                    <p className="text-gray-600 text-sm">
                        💡 Type <code className="text-neon-cyan bg-neon-cyan/10 px-2 py-1 rounded">demo</code> to explore with sample data
                    </p>
                </div>
            </div>
        </div>
    );
}
