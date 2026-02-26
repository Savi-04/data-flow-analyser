/**
 * Parse GitHub URL to extract owner, repo, branch, and path
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string; ref?: string; path?: string } | null {
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
