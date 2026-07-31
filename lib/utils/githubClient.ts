import { Octokit } from 'octokit';
import { FileNode } from '@/types';
import { withRetry } from './withRetry';

const VALID_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
const IGNORE_PATHS = ['node_modules', 'test', 'tests', '__tests__', 'dist', 'build', '.next', '.git', 'public', 'assets'];
const CONTENT_BATCH_SIZE = 10;

export function createOctokit(token?: string) {
    return new Octokit({
        auth: token || process.env.GITHUB_TOKEN,
    });
}

export interface FetchTreeOptions {
    maxFiles: number;
    maxDepth: number;
}

/**
 * Recursively walks a repo tree, collecting React source files up to
 * `options.maxFiles` / `options.maxDepth`. Shared by both analysis modes:
 * Normal calls it once for the whole repo; Deep-Dive calls it once shallowly
 * for the map, then again per agent-selected subtree.
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

            if (IGNORE_PATHS.some((ignore) => item.path.includes(ignore)) || item.name.startsWith('.')) {
                continue;
            }

            if (item.type === 'file') {
                if (VALID_EXTENSIONS.some((ext) => item.name.endsWith(ext))) {
                    files.push({ path: item.path, name: item.name, type: 'file' });
                    fileCount.count++;
                }
            } else if (item.type === 'dir') {
                const subFiles = await fetchFileTree(octokit, owner, repo, fileCount, options, ref, item.path, depth + 1);
                files.push(...subFiles);
            }
        }

        return files;
    } catch (error: any) {
        console.error(`Error fetching file tree for ${path}:`, error?.message || error);
        return [];
    }
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
