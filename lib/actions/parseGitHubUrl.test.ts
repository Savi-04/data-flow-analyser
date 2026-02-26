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
});
