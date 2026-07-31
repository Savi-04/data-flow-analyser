import { describe, it, expect, vi } from 'vitest';
import { withRetry, isTransientError, type RetryAttempt } from './withRetry';

/** Builds an Octokit-shaped error (status + response headers). */
function httpError(status: number, headers: Record<string, string> = {}) {
    return Object.assign(new Error(`HTTP ${status}`), {
        status,
        response: { headers },
    });
}

// Keep backoff effectively instant so the suite stays fast.
const FAST = { baseDelayMs: 1, maxDelayMs: 2 };

describe('isTransientError', () => {
    it('treats network errors (no status) as transient', () => {
        expect(isTransientError(new Error('socket hang up'))).toBe(true);
    });

    it('treats 429 and 5xx as transient', () => {
        expect(isTransientError(httpError(429))).toBe(true);
        expect(isTransientError(httpError(500))).toBe(true);
        expect(isTransientError(httpError(503))).toBe(true);
    });

    it('treats 403 as transient only when rate-limit quota is exhausted', () => {
        expect(isTransientError(httpError(403, { 'x-ratelimit-remaining': '0' }))).toBe(true);
        // A plain 403 is a permissions problem, not a rate limit.
        expect(isTransientError(httpError(403))).toBe(false);
        expect(isTransientError(httpError(403, { 'x-ratelimit-remaining': '57' }))).toBe(false);
    });

    it('treats 401 and 404 as permanent', () => {
        expect(isTransientError(httpError(401))).toBe(false);
        expect(isTransientError(httpError(404))).toBe(false);
    });
});

describe('withRetry', () => {
    it('returns the result without retrying when the operation succeeds', async () => {
        const operation = vi.fn().mockResolvedValue('ok');

        await expect(withRetry(operation, FAST)).resolves.toBe('ok');
        expect(operation).toHaveBeenCalledTimes(1);
    });

    it('retries a transient failure and returns the eventual success', async () => {
        const operation = vi
            .fn()
            .mockRejectedValueOnce(httpError(503))
            .mockResolvedValue('recovered');

        await expect(withRetry(operation, FAST)).resolves.toBe('recovered');
        expect(operation).toHaveBeenCalledTimes(2);
    });

    it('does not retry a permanent failure', async () => {
        const operation = vi.fn().mockRejectedValue(httpError(404));

        await expect(withRetry(operation, FAST)).rejects.toMatchObject({ status: 404 });
        expect(operation).toHaveBeenCalledTimes(1);
    });

    it('gives up after maxAttempts and rethrows the last error', async () => {
        const operation = vi.fn().mockRejectedValue(httpError(500));

        await expect(withRetry(operation, { ...FAST, maxAttempts: 3 })).rejects.toMatchObject({
            status: 500,
        });
        expect(operation).toHaveBeenCalledTimes(3);
    });

    it('reports each retry through onRetry', async () => {
        const attempts: RetryAttempt[] = [];
        const operation = vi
            .fn()
            .mockRejectedValueOnce(httpError(500))
            .mockRejectedValueOnce(httpError(429))
            .mockResolvedValue('done');

        await withRetry(operation, { ...FAST, onRetry: (info) => attempts.push(info) });

        expect(attempts).toHaveLength(2);
        expect(attempts[0]).toMatchObject({ attempt: 1, status: 500, reason: 'HTTP 500' });
        expect(attempts[1]).toMatchObject({ attempt: 2, status: 429, reason: 'HTTP 429' });
    });

    it('caps a server-requested wait at maxDelayMs', async () => {
        // retry-after of 3600s must not actually hang the request for an hour.
        const attempts: RetryAttempt[] = [];
        const operation = vi
            .fn()
            .mockRejectedValueOnce(httpError(429, { 'retry-after': '3600' }))
            .mockResolvedValue('done');

        await withRetry(operation, {
            baseDelayMs: 1,
            maxDelayMs: 5,
            onRetry: (info) => attempts.push(info),
        });

        expect(attempts[0].delayMs).toBe(5);
    });
});
