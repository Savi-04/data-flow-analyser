/**
 * Parses a GitHub repository reference into its parts.
 *
 * This is a trust boundary: `url` arrives from an unauthenticated request body
 * and everything it yields is used to build GitHub API calls, so each piece is
 * validated against what GitHub actually permits rather than passed through.
 * Returning null is the only failure mode — callers turn that into a 400.
 */

// GitHub owners are alphanumeric with hyphens; repository names also allow
// underscores and periods. Both are capped well above real-world lengths.
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;

// A git ref cannot contain whitespace, control characters, or the sequences
// git itself forbids. Kept deliberately narrow.
const REF_PATTERN = /^[A-Za-z0-9_.\-/]{1,250}$/;

/** Only a github.com host is accepted, anchored so it cannot appear in a query string. */
const GITHUB_HOST_PREFIX = /^(?:https?:\/\/)?(?:www\.)?github\.com\//i;

function isSafeOwner(value: string): boolean {
    return OWNER_PATTERN.test(value);
}

function isSafeRepo(value: string): boolean {
    return REPO_PATTERN.test(value) && !value.includes('..') && value !== '.';
}

function isSafeRef(value: string | undefined): boolean {
    if (value === undefined) return true;
    return REF_PATTERN.test(value) && !value.includes('..');
}

/** Rejects traversal and control characters without rewriting a legitimate path. */
function isSafePath(value: string | undefined): boolean {
    if (value === undefined || value === '') return true;
    if (value.length > 400) return false;
    if (value.includes('\\')) return false;
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001F\u007F]/.test(value)) return false;
    return !value.split('/').some((segment) => segment === '..');
}

export function parseGitHubUrl(url: string): { owner: string; repo: string; ref?: string; path?: string } | null {
    if (typeof url !== 'string') return null;

    // Guard against pathological input before any regex runs.
    const trimmed = url.trim();
    if (!trimmed || trimmed.length > 500) return null;

    const normalized = trimmed.replace(/\/$/, '');

    // Handle simple "owner/repo" format
    const simpleMatch = normalized.match(/^([^\/]+)\/([^\/]+)$/);
    if (simpleMatch && !GITHUB_HOST_PREFIX.test(normalized)) {
        const owner = simpleMatch[1];
        const repo = simpleMatch[2].replace(/\.git$/, '');
        if (!isSafeOwner(owner) || !isSafeRepo(repo)) return null;
        return { owner, repo };
    }

    // Handle full GitHub URLs: github.com/owner/repo/tree/branch/path
    if (!GITHUB_HOST_PREFIX.test(normalized)) return null;

    const rest = normalized.replace(GITHUB_HOST_PREFIX, '');
    // [\s\S] rather than . for the path, so a control character is captured
    // and then rejected below instead of silently truncating the path — which
    // would quietly analyse a different directory than the caller asked for.
    const urlMatch = rest.match(/^([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+)(?:\/([\s\S]*))?)?/);
    if (!urlMatch) return null;

    const owner = urlMatch[1];
    const repo = urlMatch[2].replace(/\.git$/, '');
    const ref = urlMatch[3];
    const path = urlMatch[4];

    if (!isSafeOwner(owner) || !isSafeRepo(repo) || !isSafeRef(ref) || !isSafePath(path)) {
        return null;
    }

    return { owner, repo, ref, path };
}
