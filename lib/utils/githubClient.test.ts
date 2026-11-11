import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Octokit } from 'octokit';
import { fetchFileTree } from './githubClient';

/**
 * A small repo fixture. Exercises the rules the walk has to honour: ignored
 * directories, dotfiles, non-source extensions and nesting depth.
 */
const TREE = [
    { path: 'src', type: 'tree' },
    { path: 'src/App.tsx', type: 'blob', size: 100 },
    { path: 'src/helpers.js', type: 'blob', size: 50 },
    { path: 'src/README.md', type: 'blob', size: 10 },
    { path: 'src/components', type: 'tree' },
    { path: 'src/components/Button.tsx', type: 'blob', size: 70 },
    { path: 'src/components/deep', type: 'tree' },
    { path: 'src/components/deep/Deeper.tsx', type: 'blob', size: 30 },
    { path: 'src/__tests__', type: 'tree' },
    { path: 'src/__tests__/App.test.tsx', type: 'blob', size: 20 },
    { path: '.github', type: 'tree' },
    { path: '.github/ci.ts', type: 'blob', size: 5 },
    { path: 'dist', type: 'tree' },
    { path: 'dist/bundle.js', type: 'blob', size: 900 },
];

/** Serves the same fixture through the per-directory `getContent` endpoint. */
function contentsFor(path: string) {
    return TREE.filter((e) => {
        const slash = e.path.lastIndexOf('/');
        const parent = slash === -1 ? '' : e.path.slice(0, slash);
        return parent === path;
    }).map((e) => ({
        path: e.path,
        name: e.path.slice(e.path.lastIndexOf('/') + 1),
        type: e.type === 'tree' ? 'dir' : 'file',
    }));
}

function makeOctokit({ truncated = false, treeFails = false } = {}) {
    const getTree = vi.fn(async () => {
        if (treeFails) throw Object.assign(new Error('Not Found'), { status: 404 });
        return { data: { truncated, tree: TREE } };
    });
    const getContent = vi.fn(async ({ path }: { path: string }) => ({ data: contentsFor(path) }));
    return {
        octokit: { rest: { git: { getTree }, repos: { getContent } } } as unknown as Octokit,
        getTree,
        getContent,
    };
}

const OPTS = { maxFiles: 200, maxDepth: 10 };

// The tree index is cached per owner/repo/ref, so each test needs its own repo
// name to avoid picking up a neighbour's cached tree.
let repoSeq = 0;
beforeEach(() => {
    repoSeq++;
});
const repoName = () => `repo-${repoSeq}`;

describe('fetchFileTree — trees-API fast path', () => {
    it('collects source files in one API call instead of one per directory', async () => {
        const { octokit, getTree, getContent } = makeOctokit();
        const files = await fetchFileTree(octokit, 'o', repoName(), { count: 0 }, OPTS);

        expect(getTree).toHaveBeenCalledTimes(1);
        expect(getContent).not.toHaveBeenCalled();
        expect(files.map((f) => f.path)).toEqual([
            'src/App.tsx',
            'src/helpers.js',
            'src/components/Button.tsx',
            'src/components/deep/Deeper.tsx',
        ]);
    });

    it('skips ignored dirs, dotted dirs and non-source extensions', async () => {
        const { octokit } = makeOctokit();
        const files = await fetchFileTree(octokit, 'o', repoName(), { count: 0 }, OPTS);
        const paths = files.map((f) => f.path);

        expect(paths).not.toContain('src/README.md');
        expect(paths.some((p) => p.includes('__tests__'))).toBe(false);
        expect(paths.some((p) => p.startsWith('.github'))).toBe(false);
        expect(paths.some((p) => p.startsWith('dist'))).toBe(false);
    });

    it('honours maxFiles and reports the count back to the caller', async () => {
        const { octokit } = makeOctokit();
        const fileCount = { count: 0 };
        const files = await fetchFileTree(octokit, 'o', repoName(), fileCount, { maxFiles: 2, maxDepth: 10 });

        expect(files).toHaveLength(2);
        expect(fileCount.count).toBe(2);
    });

    it('honours maxDepth', async () => {
        const { octokit } = makeOctokit();
        const files = await fetchFileTree(octokit, 'o', repoName(), { count: 0 }, { maxFiles: 200, maxDepth: 2 });

        // depth 0 lists the root, depth 1 lists src/ — so src/components/* is out of range
        expect(files.map((f) => f.path)).toEqual(['src/App.tsx', 'src/helpers.js']);
    });

    it('scopes the walk to a subtree path (used by Deep-Dive per-subtree fetches)', async () => {
        const { octokit } = makeOctokit();
        const files = await fetchFileTree(octokit, 'o', repoName(), { count: 0 }, OPTS, undefined, 'src/components');

        expect(files.map((f) => f.path)).toEqual(['src/components/Button.tsx', 'src/components/deep/Deeper.tsx']);
    });

    it('returns [] for a path that is not in the tree', async () => {
        const { octokit } = makeOctokit();
        const files = await fetchFileTree(octokit, 'o', repoName(), { count: 0 }, OPTS, undefined, 'does/not/exist');

        expect(files).toEqual([]);
    });
});

describe('fetchFileTree — fallback parity', () => {
    it('falls back to the per-directory walk when GitHub truncates the tree', async () => {
        const { octokit, getTree, getContent } = makeOctokit({ truncated: true });
        const files = await fetchFileTree(octokit, 'o', repoName(), { count: 0 }, OPTS);

        expect(getTree).toHaveBeenCalledTimes(1);
        expect(getContent).toHaveBeenCalled();
        expect(files.map((f) => f.path)).toEqual([
            'src/App.tsx',
            'src/helpers.js',
            'src/components/Button.tsx',
            'src/components/deep/Deeper.tsx',
        ]);
    });

    it('falls back when the trees call fails outright', async () => {
        const { octokit, getContent } = makeOctokit({ treeFails: true });
        const files = await fetchFileTree(octokit, 'o', repoName(), { count: 0 }, OPTS);

        expect(getContent).toHaveBeenCalled();
        expect(files).toHaveLength(4);
    });

    it('both paths produce byte-identical results for the same repo', async () => {
        const fast = makeOctokit();
        const slow = makeOctokit({ truncated: true });

        const viaTree = await fetchFileTree(fast.octokit, 'o', repoName(), { count: 0 }, OPTS);
        repoSeq++;
        const viaContents = await fetchFileTree(slow.octokit, 'o', repoName(), { count: 0 }, OPTS);

        expect(viaTree).toEqual(viaContents);
    });
});

describe('fetchFileTree — tree index caching', () => {
    it('reuses one trees call across repeated fetches, as Deep-Dive does', async () => {
        const { octokit, getTree } = makeOctokit();
        const repo = repoName();

        await fetchFileTree(octokit, 'o', repo, { count: 0 }, { maxFiles: 60, maxDepth: 2 });
        await fetchFileTree(octokit, 'o', repo, { count: 0 }, OPTS, undefined, 'src/components');
        await fetchFileTree(octokit, 'o', repo, { count: 0 }, OPTS, undefined, 'src');

        expect(getTree).toHaveBeenCalledTimes(1);
    });
});
