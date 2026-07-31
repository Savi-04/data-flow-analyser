import { NextRequest, NextResponse } from 'next/server';
import { FileNode, AnalysisMode } from '@/types';
import { parseGitHubUrl } from '@/lib/utils/parseGitHubUrl';
import { withRetry } from '@/lib/utils/withRetry';
import { createOctokit, fetchFileTree, fetchContentsBatched } from '@/lib/utils/githubClient';
import { checkRateLimit } from '@/lib/utils/rateLimit';
import { runDeepDiveAnalysis } from '@/lib/agent/analyzeAgent';

// Limits to prevent timeouts
const MAX_FILES = 200;
const MAX_DEPTH = 10;

// Deep-Dive spends real Gemini quota per request — cap how often one caller can trigger it.
const DEEP_DIVE_RATE_LIMIT = 5;
const DEEP_DIVE_RATE_WINDOW_MS = 60_000;

/** Lets the client know whether Deep-Dive mode can be offered, without ever exposing the key itself. */
export async function GET() {
    return NextResponse.json({ deepDiveAvailable: Boolean(process.env.GOOGLE_API_KEY) });
}

export async function POST(request: NextRequest) {
    try {
        const { repoUrl, token, mode: rawMode } = await request.json();
        const mode: AnalysisMode = rawMode === 'deep-dive' ? 'deep-dive' : 'normal';

        console.log('Fetching repo data for:', repoUrl, `(mode: ${mode})`);

        if (mode === 'deep-dive') {
            if (!process.env.GOOGLE_API_KEY) {
                return NextResponse.json(
                    { error: 'Deep-Dive Agentic Insights is not configured on this server (missing GOOGLE_API_KEY).' },
                    { status: 400 }
                );
            }

            const clientKey = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown';
            const { limited, retryAfterSeconds } = checkRateLimit(clientKey, DEEP_DIVE_RATE_LIMIT, DEEP_DIVE_RATE_WINDOW_MS);
            if (limited) {
                return NextResponse.json(
                    { error: 'Too many Deep-Dive requests. Please wait before trying again.' },
                    { status: 429, headers: retryAfterSeconds ? { 'retry-after': String(retryAfterSeconds) } : undefined }
                );
            }
        }

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

        // Verify repository exists. A rate-limited 403 is retried; 404 fails fast.
        try {
            await withRetry(() => octokit.rest.repos.get({ owner, repo }), {
                onRetry: ({ attempt, maxAttempts, delayMs, reason }) =>
                    console.warn(
                        `[retry ${attempt}/${maxAttempts}] repo lookup ${owner}/${repo} — ${reason}; waiting ${delayMs}ms`
                    ),
            });
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

        if (mode === 'deep-dive') {
            const result = await runDeepDiveAnalysis({
                octokit,
                owner,
                repo,
                ref,
                rootPath: path || '',
                fileBudget: MAX_FILES,
            });

            if (result.files.length === 0) {
                return NextResponse.json(
                    { error: `No React files found in ${path || 'root'}. Make sure it contains .js, .jsx, .ts, or .tsx files.` },
                    { status: 404 }
                );
            }

            return NextResponse.json({
                owner,
                repo,
                files: result.files,
                deepDive: {
                    patterns: result.patterns,
                    assessment: result.assessment,
                    workflow: result.workflow,
                },
            });
        }

        // Normal mode — unchanged from the original single-pass traversal.
        const fileCount = { count: 0 };
        const files = await fetchFileTree(
            octokit,
            owner,
            repo,
            fileCount,
            { maxFiles: MAX_FILES, maxDepth: MAX_DEPTH },
            ref,
            path || '',
            0
        );

        if (files.length === 0) {
            return NextResponse.json(
                { error: `No React files found in ${path || 'root'}. Make sure it contains .js, .jsx, .ts, or .tsx files.` },
                { status: 404 }
            );
        }

        console.log(`Found ${files.length} files, fetching content...`);

        const filesWithContent: FileNode[] = await fetchContentsBatched(octokit, owner, repo, files, ref);

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
