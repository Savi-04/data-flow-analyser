import { describe, it, expect } from 'vitest';
import { parseGitHubUrl } from '@/lib/utils/parseGitHubUrl';

describe('parseGitHubUrl', () => {
    // ─── Simple "owner/repo" Format ───────────────────────────────────────

    it('parses simple owner/repo format', () => {
        const result = parseGitHubUrl('facebook/react');
        expect(result).toEqual({
            owner: 'facebook',
            repo: 'react',
        });
    });

    it('strips .git suffix from simple format', () => {
        const result = parseGitHubUrl('vercel/next.js.git');
        expect(result).toEqual({
            owner: 'vercel',
            repo: 'next.js',
        });
    });

    // ─── Full GitHub URLs ─────────────────────────────────────────────────

    it('parses full GitHub URL', () => {
        const result = parseGitHubUrl('https://github.com/facebook/react');
        expect(result).toEqual({
            owner: 'facebook',
            repo: 'react',
            ref: undefined,
            path: undefined,
        });
    });

    it('parses GitHub URL with branch', () => {
        const result = parseGitHubUrl('https://github.com/facebook/react/tree/main');
        expect(result).toEqual({
            owner: 'facebook',
            repo: 'react',
            ref: 'main',
            path: undefined,
        });
    });

    it('parses GitHub URL with branch and path', () => {
        const result = parseGitHubUrl('https://github.com/facebook/react/tree/main/packages/react');
        expect(result).toEqual({
            owner: 'facebook',
            repo: 'react',
            ref: 'main',
            path: 'packages/react',
        });
    });

    it('strips trailing slash from URLs', () => {
        const result = parseGitHubUrl('https://github.com/facebook/react/');
        expect(result).toEqual({
            owner: 'facebook',
            repo: 'react',
            ref: undefined,
            path: undefined,
        });
    });

    it('strips .git suffix from full URL', () => {
        const result = parseGitHubUrl('https://github.com/facebook/react.git');
        expect(result).toEqual({
            owner: 'facebook',
            repo: 'react',
            ref: undefined,
            path: undefined,
        });
    });

    // ─── Invalid URLs ─────────────────────────────────────────────────────

    it('returns null for invalid URLs', () => {
        expect(parseGitHubUrl('not-a-url')).toBeNull();
        expect(parseGitHubUrl('https://gitlab.com/user/repo')).toBeNull();
        expect(parseGitHubUrl('')).toBeNull();
    });

    // ─── Edge Cases ───────────────────────────────────────────────────────

    it('handles repos with dots in name', () => {
        const result = parseGitHubUrl('vercel/next.js');
        expect(result).toEqual({
            owner: 'vercel',
            repo: 'next.js',
        });
    });

    it('handles HTTP (non-HTTPS) URLs', () => {
        const result = parseGitHubUrl('http://github.com/facebook/react');
        expect(result).toEqual({
            owner: 'facebook',
            repo: 'react',
            ref: undefined,
            path: undefined,
        });
    });

    // --- Input validation (trust boundary) -------------------------------

    it('rejects a non-GitHub host that merely mentions github.com', () => {
        // Previously the host pattern matched anywhere in the string, so an
        // attacker-controlled host could smuggle a repo reference through.
        expect(parseGitHubUrl('https://evil.example.com/?x=github.com/facebook/react')).toBeNull();
        expect(parseGitHubUrl('https://notgithub.com/facebook/react')).toBeNull();
    });

    it('accepts a bare github.com host without a scheme', () => {
        expect(parseGitHubUrl('github.com/facebook/react')).toEqual({
            owner: 'facebook',
            repo: 'react',
            ref: undefined,
            path: undefined,
        });
    });

    it('rejects owners and repos containing characters GitHub does not allow', () => {
        expect(parseGitHubUrl('fa$cebook/react')).toBeNull();
        expect(parseGitHubUrl('facebook/re act')).toBeNull();
        expect(parseGitHubUrl('https://github.com/face%2fbook/react')).toBeNull();
    });

    it('rejects traversal sequences in owner, repo, ref and path', () => {
        expect(parseGitHubUrl('../../etc/passwd')).toBeNull();
        expect(parseGitHubUrl('https://github.com/facebook/..')).toBeNull();
        expect(parseGitHubUrl('https://github.com/facebook/react/tree/../../x')).toBeNull();
        expect(parseGitHubUrl('https://github.com/facebook/react/tree/main/../../secrets')).toBeNull();
    });

    it('rejects control characters in a subdirectory path', () => {
        expect(parseGitHubUrl('https://github.com/facebook/react/tree/main/src\u0000x')).toBeNull();
        expect(parseGitHubUrl('https://github.com/facebook/react/tree/main/src\nIGNORE')).toBeNull();
    });

    it('rejects pathological input lengths', () => {
        expect(parseGitHubUrl('a'.repeat(600) + '/repo')).toBeNull();
        expect(parseGitHubUrl('facebook/' + 'r'.repeat(200))).toBeNull();
    });

    it('rejects non-string input without throwing', () => {
        expect(parseGitHubUrl(undefined as unknown as string)).toBeNull();
        expect(parseGitHubUrl(null as unknown as string)).toBeNull();
        expect(parseGitHubUrl(42 as unknown as string)).toBeNull();
    });

    it('still accepts a legitimate nested path', () => {
        expect(parseGitHubUrl('https://github.com/facebook/react/tree/main/packages/react-dom/src')).toEqual({
            owner: 'facebook',
            repo: 'react',
            ref: 'main',
            path: 'packages/react-dom/src',
        });
    });
});
