import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from 'octokit';
import { FileNode } from '@/types';
import { parseGitHubUrl } from '@/lib/utils/parseGitHubUrl';

// Limits to prevent timeouts
const MAX_FILES = 200;
const MAX_DEPTH = 10;

function createOctokit(token?: string) {
    return new Octokit({
        auth: token || process.env.GITHUB_TOKEN,
    });
}

async function fetchFileTree(
    octokit: Octokit,
    owner: string,
    repo: string,
    fileCount: { count: number },
    ref?: string,
    path: string = '',
    depth: number = 0
): Promise<FileNode[]> {
    if (depth >= MAX_DEPTH || fileCount.count >= MAX_FILES) {
        return [];
    }

    try {
        const params: any = { owner, repo, path };
        if (ref) params.ref = ref;

        const { data } = await octokit.rest.repos.getContent(params);

        if (!Array.isArray(data)) {
            return [];
        }

        const files: FileNode[] = [];
        const validExtensions = ['.js', '.jsx', '.ts', '.tsx'];
        const ignorePaths = ['node_modules', 'test', 'tests', '__tests__', 'dist', 'build', '.next', '.git', 'public', 'assets'];

        for (const item of data) {
            if (fileCount.count >= MAX_FILES) break;

            if (ignorePaths.some(ignore => item.path.includes(ignore)) || item.name.startsWith('.')) {
                continue;
            }

            if (item.type === 'file') {
                if (validExtensions.some(ext => item.name.endsWith(ext))) {
                    files.push({ path: item.path, name: item.name, type: 'file' });
                    fileCount.count++;
                }
            } else if (item.type === 'dir') {
                const subFiles = await fetchFileTree(octokit, owner, repo, fileCount, ref, item.path, depth + 1);
                files.push(...subFiles);
            }
        }

        return files;
    } catch (error: any) {
        console.error(`Error fetching file tree for ${path}:`, error?.message || error);
        return [];
    }
}

async function fetchFileContent(
    octokit: Octokit,
    owner: string,
    repo: string,
    path: string,
    ref?: string
): Promise<string> {
    try {
        const params: any = { owner, repo, path };
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

export async function POST(request: NextRequest) {
    try {
        const { repoUrl, token } = await request.json();

        console.log('Fetching repo data for:', repoUrl);

        const octokit = createOctokit(token);
        const parsed = parseGitHubUrl(repoUrl);

        if (!parsed) {
            return NextResponse.json(
                { error: 'Invalid GitHub URL. Please use format: owner/repo or https://github.com/owner/repo' },
                { status: 400 }
            );
        }

        const { owner, repo, ref, path } = parsed;
        console.log(`Parsed: ${owner}/${repo} (ref: ${ref}, path: ${path})`);

        // Verify repository exists
        try {
            await octokit.rest.repos.get({ owner, repo });
        } catch (error: any) {
            if (error?.status === 404) {
                return NextResponse.json(
                    { error: `Repository ${owner}/${repo} not found. Please check the URL.` },
                    { status: 404 }
                );
            }
            if (error?.status === 403) {
                return NextResponse.json(
                    { error: 'GitHub API rate limit exceeded. Please try again later or add a GitHub Personal Access Token.' },
                    { status: 429 }
                );
            }
            throw error;
        }

        console.log('Repository found, fetching files...');

        const fileCount = { count: 0 };
        const files = await fetchFileTree(octokit, owner, repo, fileCount, ref, path || '', 0);

        if (files.length === 0) {
            return NextResponse.json(
                { error: `No React files found in ${path || 'root'}. Make sure it contains .js, .jsx, .ts, or .tsx files.` },
                { status: 404 }
            );
        }

        console.log(`Found ${files.length} files, fetching content...`);

        // Fetch content in batches
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

        return NextResponse.json({
            owner,
            repo,
            files: filesWithContent,
        });
    } catch (error: any) {
        console.error('Error fetching repo data:', error?.message || error);
        return NextResponse.json(
            { error: error?.message || 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}
