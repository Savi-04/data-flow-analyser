import { describe, it, expect } from 'vitest';
import { analyzeCode } from './analyzeCode';
import { FileNode } from '@/types';

// Helper to create a FileNode
function makeFile(path: string, content: string): FileNode {
    return { path, name: path.split('/').pop()!, type: 'file', content };
}

describe('analyzeCode', () => {
    // ─── Component Detection ──────────────────────────────────────────────

    it('detects arrow function components', () => {
        const files = [
            makeFile('src/App.tsx', `
        import React from 'react';
        export const App = () => {
          return <div>Hello</div>;
        };
      `),
            makeFile('src/Header.tsx', `
        import { App } from './App';
        export const Header = (props) => {
          return <App />;
        };
      `),
        ];

        const result = analyzeCode(files);
        const appNode = result.nodes.find(n => n.name === 'App');
        const headerNode = result.nodes.find(n => n.name === 'Header');

        expect(appNode).toBeDefined();
        expect(appNode?.type).toBe('component');
        expect(headerNode).toBeDefined();
        expect(headerNode?.type).toBe('component');
    });

    it('detects regular function components', () => {
        const files = [
            makeFile('src/Button.tsx', `
        export function Button({ label }) {
          return <button>{label}</button>;
        }
      `),
            makeFile('src/Form.tsx', `
        import { Button } from './Button';
        export function Form() {
          return <Button label="Submit" />;
        }
      `),
        ];

        const result = analyzeCode(files);
        const buttonNode = result.nodes.find(n => n.name === 'Button');

        expect(buttonNode).toBeDefined();
        expect(buttonNode?.type).toBe('component');
    });

    it('detects class components', () => {
        const files = [
            makeFile('src/Legacy.tsx', `
        import React from 'react';
        export class LegacyWidget extends React.Component {
          render() { return <div>Legacy</div>; }
        }
      `),
            makeFile('src/Parent.tsx', `
        import { LegacyWidget } from './Legacy';
        export function Parent() {
          return <LegacyWidget />;
        }
      `),
        ];

        const result = analyzeCode(files);
        const legacyNode = result.nodes.find(n => n.name === 'LegacyWidget');

        expect(legacyNode).toBeDefined();
        expect(legacyNode?.type).toBe('component');
    });

    // ─── Hook Detection ───────────────────────────────────────────────────

    it('detects custom hooks', () => {
        const files = [
            makeFile('src/hooks/useAuth.ts', `
        import { useState } from 'react';
        export function useAuth() {
          const [user, setUser] = useState(null);
          return { user };
        }
      `),
            makeFile('src/Login.tsx', `
        import { useAuth } from './hooks/useAuth';
        export function Login() {
          const { user } = useAuth();
          return <div>{user?.name}</div>;
        }
      `),
        ];

        const result = analyzeCode(files);
        const hookNode = result.nodes.find(n => n.name === 'useAuth');

        expect(hookNode).toBeDefined();
        expect(hookNode?.type).toBe('hook');
        expect(hookNode?.usesState).toBe(true);
    });

    // ─── Utility Detection ────────────────────────────────────────────────

    it('detects utility/helper files', () => {
        const files = [
            makeFile('src/utils/format.ts', `
        export function formatDate(date) {
          return date.toISOString();
        }
        export const formatCurrency = (amount) => '$' + amount.toFixed(2);
      `),
            makeFile('src/Display.tsx', `
        import { formatDate } from './utils/format';
        export function Display() {
          return <span>{formatDate(new Date())}</span>;
        }
      `),
        ];

        const result = analyzeCode(files);
        const utilNode = result.nodes.find(n => n.name === 'formatDate');

        expect(utilNode).toBeDefined();
        expect(utilNode?.type).toBe('util');
        expect(utilNode?.exports).toContain('formatDate');
        expect(utilNode?.exports).toContain('formatCurrency');
    });

    // ─── Import Extraction & Link Building ────────────────────────────────

    it('builds links based on imports', () => {
        const files = [
            makeFile('src/App.tsx', `
        import { Header } from './Header';
        export const App = () => <Header title="Hello" />;
      `),
            makeFile('src/Header.tsx', `
        import { Logo } from './Logo';
        export const Header = ({ title }) => <div><Logo />{title}</div>;
      `),
            makeFile('src/Logo.tsx', `
        export const Logo = () => <img src="logo.png" />;
      `),
        ];

        const result = analyzeCode(files);

        expect(result.links.length).toBeGreaterThanOrEqual(2);

        const appToHeader = result.links.find(
            l => l.source === 'src/App' && l.target === 'src/Header'
        );
        expect(appToHeader).toBeDefined();
        expect(appToHeader?.props).toContain('title');

        const headerToLogo = result.links.find(
            l => l.source === 'src/Header' && l.target === 'src/Logo'
        );
        expect(headerToLogo).toBeDefined();
    });

    it('ignores third-party imports (non-relative, non-alias)', () => {
        const files = [
            makeFile('src/App.tsx', `
        import React from 'react';
        import { useState } from 'react';
        import axios from 'axios';
        import { Button } from './Button';
        export const App = () => <Button />;
      `),
            makeFile('src/Button.tsx', `
        export const Button = () => <button>Click</button>;
      `),
        ];

        const result = analyzeCode(files);
        // Should only have 1 link (App -> Button), not links to react/axios
        expect(result.links.length).toBe(1);
        expect(result.links[0].source).toBe('src/App');
        expect(result.links[0].target).toBe('src/Button');
    });

    // ─── State Variable Extraction ────────────────────────────────────────

    it('extracts useState variables and tracks consumers', () => {
        const files = [
            makeFile('src/App.tsx', `
        import { useState } from 'react';
        import { Display } from './Display';
        export function App() {
          const [count, setCount] = useState(0);
          return <Display count={count} />;
        }
      `),
            makeFile('src/Display.tsx', `
        export function Display({ count }) {
          return <span>{count}</span>;
        }
      `),
        ];

        const result = analyzeCode(files);

        expect(result.stateVariables.length).toBe(1);
        expect(result.stateVariables[0].name).toBe('count');
        expect(result.stateVariables[0].setterName).toBe('setCount');
        expect(result.stateVariables[0].sourceComponentName).toBe('App');
        expect(result.stateVariables[0].consumers).toContain('src/Display');
    });

    // ─── Complexity Calculation ───────────────────────────────────────────

    it('calculates node complexity (connection count)', () => {
        const files = [
            makeFile('src/App.tsx', `
        import { Header } from './Header';
        import { Footer } from './Footer';
        export function App() {
          return <div><Header /><Footer /></div>;
        }
      `),
            makeFile('src/Header.tsx', `
        export function Header() { return <header>H</header>; }
      `),
            makeFile('src/Footer.tsx', `
        export function Footer() { return <footer>F</footer>; }
      `),
        ];

        const result = analyzeCode(files);
        const appNode = result.nodes.find(n => n.name === 'App');

        // App connects to Header and Footer => complexity >= 2
        expect(appNode?.complexity).toBeGreaterThanOrEqual(2);
    });

    // ─── Filtering Isolated Nodes ─────────────────────────────────────────

    it('filters out isolated nodes with no connections', () => {
        const files = [
            makeFile('src/App.tsx', `
        import { Header } from './Header';
        export function App() { return <Header />; }
      `),
            makeFile('src/Header.tsx', `
        export function Header() { return <h1>Hello</h1>; }
      `),
            makeFile('src/Orphan.tsx', `
        export function Orphan() { return <div>No one imports me</div>; }
      `),
        ];

        const result = analyzeCode(files);
        const orphan = result.nodes.find(n => n.name === 'Orphan');

        expect(orphan).toBeUndefined();
    });

    // ─── Edge Cases ───────────────────────────────────────────────────────

    it('handles files without content gracefully', () => {
        const files: FileNode[] = [
            { path: 'src/Empty.tsx', name: 'Empty.tsx', type: 'file' },
        ];

        const result = analyzeCode(files);
        expect(result.nodes).toHaveLength(0);
        expect(result.links).toHaveLength(0);
    });

    it('handles empty file array', () => {
        const result = analyzeCode([]);
        expect(result.nodes).toHaveLength(0);
        expect(result.links).toHaveLength(0);
        expect(result.stateVariables).toHaveLength(0);
    });

    it('detects useState and useEffect usage flags', () => {
        const files = [
            makeFile('src/Timer.tsx', `
        import { useState, useEffect } from 'react';
        import { Display } from './Display';
        export function Timer() {
          const [time, setTime] = useState(0);
          useEffect(() => { const id = setInterval(() => setTime(t => t + 1), 1000); return () => clearInterval(id); }, []);
          return <Display time={time} />;
        }
      `),
            makeFile('src/Display.tsx', `
        export function Display({ time }) {
          return <span>{time}</span>;
        }
      `),
        ];

        const result = analyzeCode(files);
        const timerNode = result.nodes.find(n => n.name === 'Timer');

        expect(timerNode?.usesState).toBe(true);
        expect(timerNode?.usesEffect).toBe(true);
    });
});
