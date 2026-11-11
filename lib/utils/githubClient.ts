import { Octokit } from 'octokit';
import { FileNode } from '@/types';
import { withRetry } from './withRetry';

const VALID_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
const IGNORE_PATHS = ['node_modules', 'test', 'tests', '__tests__', 'dist', 'build', '.next', '.git', 'public', 'assets'];
const CONTENT_BATCH_SIZE = 24;

export function createOctokit(token?: string) {
    return new Octokit({
        auth: token || process.env.GITHUB_TOKEN,
    });
}

/** Shared so the trees-API fast path and the getContent fallback cannot drift apart. */
function isIgnoredPath(fullPath: string, name: string): boolean {
    return IGNORE_PATHS.some((ignore) => fullPath.includes(ignore)) || name.startsWith('.');
}

function isSourceFile(name: string): boolean {
    return VALID_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export interface FetchTreeOptions {
    maxFiles: number;
    maxDepth: number;
}

/**
 * Fallback traversal: one `getContent` call per directory, depth-first.
 * Correct but costs a sequential round-trip per directory, which is why
 * `fetchFileTree` prefers the single-call trees API and only lands here when
 * that is unavailable or truncated.
 */
async function fetchFileTreeViaContents(
    octokit: Octokit,
    owner: string,
    repo: string,
    fileCount: { count: number },
    options: FetchTreeOptions,
    ref?: string,
    path: string = '',
    depth: number = 0
): Promise<FileNode[]> {
    if (depth >= options.maxDepth || fileCount.count >= options.maxFiles) {
        return [];
    }

    try {
        const params: any = { owner, repo, path };
        if (ref) params.ref = ref;

        const { data } = await withRetry(() => octokit.rest.repos.getContent(params), {
            onRetry: ({ attempt, maxAttempts, delayMs, reason }) =>
                console.warn(
                    `[retry ${attempt}/${maxAttempts}] tree "${path || '/'}" — ${reason}; waiting ${delayMs}ms`
                ),
        });

        if (!Array.isArray(data)) {
            return [];
        }

        const files: FileNode[] = [];

        for (const item of data) {
            if (fileCount.count >= options.maxFiles) break;

            if (isIgnoredPath(item.path, item.name)) {
                continue;
            }

            if (item.type === 'file') {
                if (isSourceFile(item.name)) {
                    files.push({ path: item.path, name: item.name, type: 'file' });
                    fileCount.count++;
                }
            } else if (item.type === 'dir') {
                const subFiles = await fetchFileTreeViaContents(octokit, owner, repo, fileCount, options, ref, item.path, depth + 1);
                files.push(...subFiles);
            }
        }

        return files;
    } catch (error: any) {
        console.error(`Error fetching file tree for ${path}:`, error?.message || error);
        return [];
    }
}

// ─── Tree index (fast path) ─────────────────────────────────────────────────
// The per-directory walk costs one sequential round-trip per directory, which
// is fine for small repos but fatal for large ones: facebook/react needs 72
// directory calls before a single file's content is fetched, which alone
// exceeds a 10s serverless budget. GitHub's recursive trees endpoint returns
// the entire tree in ONE call, so we walk it in memory instead.

interface TreeEntry {
    path: string;
    type: string;
    size?: number;
}

interface TreeIndex {
    /** Children of each directory path ('' for the repo root), in API order. */
    children: Map<string, TreeEntry[]>;
}

// A warm serverless instance serves several calls per request (Deep-Dive asks
// for the shallow map, then one subtree per agent decision). Caching the index
// makes all of those free. Small and short-lived on purpose.
const TREE_CACHE_TTL_MS = 60_000;
const TREE_CACHE_MAX_ENTRIES = 4;
const treeCache = new Map<string, { index: TreeIndex; expiresAt: number }>();

function buildTreeIndex(entries: TreeEntry[]): TreeIndex {
    const children = new Map<string, TreeEntry[]>();
    for (const entry of entries) {
        const slash = entry.path.lastIndexOf('/');
        const parent = slash === -1 ? '' : entry.path.slice(0, slash);
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent)!.push(entry);
    }
    return { children };
}

/**
 * Fetches the whole repo tree in a single call. Returns null when the fast
 * path is not usable — a failed call, or a tree so large GitHub truncated it
 * (in which case the response is an incomplete view of the repo and we must
 * fall back rather than silently analyse a partial tree).
 */
async function fetchTreeIndex(
    octokit: Octokit,
    owner: string,
    repo: string,
    ref?: string
): Promise<TreeIndex | null> {
    const cacheKey = `${owner}/${repo}@${ref ?? 'HEAD'}`;
    const cached = treeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.index;
    }

    try {
        const { data } = await withRetry(
            () =>
                octokit.rest.git.getTree({
                    owner,
                    repo,
                    tree_sha: ref || 'HEAD',
                    recursive: '1',
                }),
            {
                onRetry: ({ attempt, maxAttempts, delayMs, reason }) =>
                    console.warn(
                        `[retry ${attempt}/${maxAttempts}] tree index ${cacheKey} — ${reason}; waiting ${delayMs}ms`
                    ),
            }
        );

        if (data.truncated) {
            console.warn(`Tree index for ${cacheKey} was truncated by GitHub — falling back to per-directory walk.`);
            return null;
        }

        const index = buildTreeIndex(data.tree as TreeEntry[]);

        if (treeCache.size >= TREE_CACHE_MAX_ENTRIES) {
            const oldest = treeCache.keys().next().value;
            if (oldest !== undefined) treeCache.delete(oldest);
        }
        treeCache.set(cacheKey, { index, expiresAt: Date.now() + TREE_CACHE_TTL_MS });

        return index;
    } catch (error: any) {
        console.warn(`Tree index unavailable for ${cacheKey} (${error?.message || error}) — falling back.`);
        return null;
    }
}

/** Depth-first walk of the in-memory index, mirroring the fallback's order and limits exactly. */
function walkTreeIndex(
    index: TreeIndex,
    rootPath: string,
    fileCount: { count: number },
    options: FetchTreeOptions
): FileNode[] {
    const files: FileNode[] = [];

    function visit(dirPath: string, depth: number) {
        if (depth >= options.maxDepth || fileCount.count >= options.maxFiles) return;

        for (const entry of index.children.get(dirPath) ?? []) {
            if (fileCount.count >= options.maxFiles) break;

            const name = entry.path.slice(entry.path.lastIndexOf('/') + 1);
            if (isIgnoredPath(entry.path, name)) continue;

            if (entry.type === 'blob') {
                if (isSourceFile(name)) {
                    files.push({ path: entry.path, name, type: 'file' });
                    fileCount.count++;
                }
            } else if (entry.type === 'tree') {
                visit(entry.path, depth + 1);
            }
        }
    }

    visit(rootPath, 0);
    return files;
}

/**
 * Collects React source files up to `options.maxFiles` / `options.maxDepth`.
 * Shared by both analysis modes: Normal calls it once for the whole repo;
 * Deep-Dive calls it once shallowly for the map, then again per
 * agent-selected subtree.
 *
 * Prefers the single-call trees endpoint and falls back to the original
 * per-directory traversal if that is unavailable or truncated, so behaviour is
 * unchanged for every repo that already worked.
 */
export async function fetchFileTree(
    octokit: Octokit,
    owner: string,
    repo: string,
    fileCount: { count: number },
    options: FetchTreeOptions,
    ref?: string,
    path: string = '',
    depth: number = 0
): Promise<FileNode[]> {
    if (depth >= options.maxDepth || fileCount.count >= options.maxFiles) {
        return [];
    }

    const index = await fetchTreeIndex(octokit, owner, repo, ref);
    if (index) {
        // An unknown root with no children means the path genuinely is not in
        // the tree; returning [] matches the fallback's behaviour for a 404.
        return walkTreeIndex(index, path, fileCount, options);
    }

    return fetchFileTreeViaContents(octokit, owner, repo, fileCount, options, ref, path, depth);
}

export async function fetchFileContent(
    octokit: Octokit,
    owner: string,
    repo: string,
    path: string,
    ref?: string
): Promise<string> {
    try {
        const params: any = { owner, repo, path };
        if (ref) params.ref = ref;

        const { data } = await withRetry(() => octokit.rest.repos.getContent(params), {
            onRetry: ({ attempt, maxAttempts, delayMs, reason }) =>
                console.warn(
                    `[retry ${attempt}/${maxAttempts}] content "${path}" — ${reason}; waiting ${delayMs}ms`
                ),
        });

        if ('content' in data && data.content) {
            return Buffer.from(data.content, 'base64').toString('utf-8');
        }

        return '';
    } catch (error: any) {
        console.error(`Error fetching content for ${path}:`, error?.message || error);
        return '';
    }
}

/** Fetches file contents in batches of 10 concurrent requests, same pattern the route always used. */
export async function fetchContentsBatched(
    octokit: Octokit,
    owner: string,
    repo: string,
    files: FileNode[],
    ref?: string
): Promise<FileNode[]> {
    const filesWithContent: FileNode[] = [];

    for (let i = 0; i < files.length; i += CONTENT_BATCH_SIZE) {
        const batch = files.slice(i, i + CONTENT_BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map(async (file) => {
                const content = await fetchFileContent(octokit, owner, repo, file.path, ref);
                return { ...file, content };
            })
        );
        filesWithContent.push(...batchResults);
    }

    return filesWithContent;
}
