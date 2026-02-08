'use server';

import { Octokit } from 'octokit';
import { FileNode, RepoData } from '@/types';

// Create Octokit instance with optional token
function createOctokit(token?: string) {
    return new Octokit({
        auth: token || process.env.GITHUB_TOKEN, // Use provided token or fallback to env
    });
}

// Limits to prevent timeouts
const MAX_FILES = 200;
const MAX_DEPTH = 10;

/**
 * Parse GitHub URL to extract owner, repo, branch, and path
 */
function parseGitHubUrl(url: string): { owner: string; repo: string; ref?: string; path?: string } | null {
    // Remove trailing slash
    url = url.replace(/\/$/, '');

    // Handle simple "owner/repo" format
    const simpleMatch = url.match(/^([^\/]+)\/([^\/]+)$/);
    if (simpleMatch) {
        return {
            owner: simpleMatch[1],
            repo: simpleMatch[2].replace(/\.git$/, ''),
        };
    }

    // Handle full GitHub URLs
    // Matches: github.com/owner/repo/tree/branch/path
    const urlMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+)(?:\/(.*))?)?/);

    if (urlMatch) {
        return {
            owner: urlMatch[1],
            repo: urlMatch[2].replace(/\.git$/, ''),
            ref: urlMatch[3], // Branch name (optional)
            path: urlMatch[4], // Subdirectory path (optional)
        };
    }

    return null;
}

/**
 * Fetch file tree recursively from GitHub
 */
async function fetchFileTree(
    octokit: Octokit,
    owner: string,
    repo: string,
    fileCount: { count: number },
    ref?: string,
    path: string = '',
    depth: number = 0
): Promise<FileNode[]> {
    // Stop if we've hit limits
    if (depth >= MAX_DEPTH || fileCount.count >= MAX_FILES) {
        return [];
    }

    try {
        const params: any = {
            owner,
            repo,
            path,
        };
        if (ref) params.ref = ref;

        const { data } = await octokit.rest.repos.getContent(params);

        if (!Array.isArray(data)) {
            return [];
        }

        const files: FileNode[] = [];
        const validExtensions = ['.js', '.jsx', '.ts', '.tsx'];
        const ignorePaths = ['node_modules', 'test', 'tests', '__tests__', 'dist', 'build', '.next', '.git', 'public', 'assets'];

        for (const item of data) {
            // Stop if we've reached file limit
            if (fileCount.count >= MAX_FILES) {
                break;
            }

            // Skip ignored directories and hidden files
            if (ignorePaths.some(ignore => item.path.includes(ignore)) || item.name.startsWith('.')) {
                continue;
            }

            if (item.type === 'file') {
                // Only include valid file extensions
                if (validExtensions.some(ext => item.name.endsWith(ext))) {
                    files.push({
                        path: item.path,
                        name: item.name,
                        type: 'file',
                    });
                    fileCount.count++;
                }
            } else if (item.type === 'dir') {
                // Recursively fetch subdirectories
                const subFiles = await fetchFileTree(octokit, owner, repo, fileCount, ref, item.path, depth + 1);
                files.push(...subFiles);
            }
        }

        return files;
    } catch (error: any) {
        console.error(`Error fetching file tree for ${path}:`, error?.message || error);
        // Don't throw, just return empty array to continue with other files
        return [];
    }
}

/**
 * Fetch raw content of a file
 */
async function fetchFileContent(
    octokit: Octokit,
    owner: string,
    repo: string,
    path: string,
    ref?: string
): Promise<string> {
    try {
        const params: any = {
            owner,
            repo,
            path,
        };
        if (ref) params.ref = ref;

        const { data } = await octokit.rest.repos.getContent(params);

        if ('content' in data && data.content) {
            return Buffer.from(data.content, 'base64').toString('utf-8');
        }

        return '';
    } catch (error: any) {
        console.error(`Error fetching content for ${path}:`, error?.message || error);
        return '';
    }
}

/**
 * Main function to fetch repository data
 */
export async function fetchRepoData(repoUrl: string, token?: string): Promise<RepoData | null> {
    console.log('Fetching repo data for:', repoUrl);

    const octokit = createOctokit(token);

    const parsed = parseGitHubUrl(repoUrl);

    if (!parsed) {
        throw new Error('Invalid GitHub URL. Please use format: owner/repo or https://github.com/owner/repo');
    }

    const { owner, repo, ref, path } = parsed;
    console.log(`Parsed: ${owner}/${repo} (ref: ${ref}, path: ${path})`);

    try {
        // Verify repository exists
        try {
            await octokit.rest.repos.get({ owner, repo });
        } catch (error: any) {
            if (error?.status === 404) {
                throw new Error(`Repository ${owner}/${repo} not found. Please check the URL.`);
            }
            if (error?.status === 403) {
                throw new Error('GitHub API rate limit exceeded. Please try again later or add a GITHUB_TOKEN.');
            }
            throw error;
        }

        console.log('Repository found, fetching files...');

        // Fetch file tree with limits
        // Start fetching from the specified path (subdirectory) if present
        const fileCount = { count: 0 };
        const files = await fetchFileTree(octokit, owner, repo, fileCount, ref, path || '', 0);

        if (files.length === 0) {
            throw new Error(`No React files found in ${path || 'root'}. Make sure it contains .js, .jsx, .ts, or .tsx files.`);
        }

        console.log(`Found ${files.length} files, fetching content...`);

        // Fetch content for each file (in batches to avoid overwhelming the API)
        const batchSize = 10;
        const filesWithContent: FileNode[] = [];

        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(async (file) => {
                    const content = await fetchFileContent(octokit, owner, repo, file.path, ref);
                    return { ...file, content };
                })
            );
            filesWithContent.push(...batchResults);
        }

        console.log('Successfully fetched all file content');

        return {
            owner,
            repo,
            files: filesWithContent,
        };
    } catch (error: any) {
        console.error('Error fetching repo data:', error?.message || error);
        throw error;
    }
}
