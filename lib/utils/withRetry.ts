/**
 * Exponential-backoff retry wrapper for transient network failures.
 *
 * Only transient errors are retried. Permanent failures (401 Unauthorized,
 * 404 Not Found) are rethrown immediately — retrying them burns the caller's
 * rate-limit budget without any chance of succeeding.
 *
 * GitHub signals rate limiting in two ways that matter here:
 *   - 429 with a `retry-after` header (seconds to wait)
 *   - 403 with `x-ratelimit-remaining: 0` and `x-ratelimit-reset` (epoch seconds)
 * A plain 403 without those headers is a genuine permission error, not a rate
 * limit, so it is *not* retried.
 */

export interface RetryOptions {
    /** Total attempts including the first. Default 3. */
    maxAttempts?: number;
    /** Base delay in ms, doubled each attempt. Default 500. */
    baseDelayMs?: number;
    /** Ceiling for a single backoff wait, in ms. Default 15_000. */
    maxDelayMs?: number;
    /** Called before each retry — used to record attempts into the workflow context. */
    onRetry?: (info: RetryAttempt) => void;
}

export interface RetryAttempt {
    /** 1-based index of the attempt that just failed. */
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    reason: string;
    status?: number;
}

interface HttpishError {
    status?: number;
    message?: string;
    response?: { headers?: Record<string, string | number | undefined> };
}

const DEFAULTS = {
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 15_000,
};

function headerValue(error: HttpishError, name: string): string | undefined {
    const raw = error.response?.headers?.[name];
    return raw === undefined ? undefined : String(raw);
}

/**
 * A 403 is only a rate limit when GitHub says the remaining quota is zero.
 * Otherwise it's a permissions problem and retrying is pointless.
 */
function isRateLimited403(error: HttpishError): boolean {
    if (error.status !== 403) return false;
    const remaining = headerValue(error, 'x-ratelimit-remaining');
    return remaining === '0';
}

export function isTransientError(error: unknown): boolean {
    const err = error as HttpishError;
    const status = err?.status;

    // No HTTP status at all => transport-level failure (DNS, socket, timeout).
    if (status === undefined) return true;

    if (status === 429) return true;
    if (status >= 500) return true;
    if (isRateLimited403(err)) return true;

    return false;
}

/**
 * Prefer the server's own guidance over blind backoff: `retry-after` is in
 * seconds, `x-ratelimit-reset` is an absolute epoch-seconds timestamp.
 * Returns undefined when the response carries neither.
 */
function serverRequestedDelayMs(error: unknown): number | undefined {
    const err = error as HttpishError;

    const retryAfter = headerValue(err, 'retry-after');
    if (retryAfter) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    }

    if (isRateLimited403(err)) {
        const reset = headerValue(err, 'x-ratelimit-reset');
        if (reset) {
            const resetEpochSeconds = Number(reset);
            if (Number.isFinite(resetEpochSeconds)) {
                const waitMs = resetEpochSeconds * 1000 - Date.now();
                if (waitMs > 0) return waitMs;
            }
        }
    }

    return undefined;
}

/** Exponential backoff with full jitter, to avoid retry stampedes. */
function backoffDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
    const exponential = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
    return Math.round(Math.random() * exponential);
}

function describe(error: unknown): string {
    const err = error as HttpishError;
    if (err?.status !== undefined) return `HTTP ${err.status}`;
    return err?.message ? `network error: ${err.message}` : 'network error';
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `operation`, retrying transient failures with exponential backoff.
 * Rethrows the final error once attempts are exhausted, or immediately for
 * any error classified as permanent.
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const { maxAttempts, baseDelayMs, maxDelayMs } = { ...DEFAULTS, ...options };
    const { onRetry } = options;

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            const isLastAttempt = attempt === maxAttempts;
            if (isLastAttempt || !isTransientError(error)) {
                throw error;
            }

            // Cap a server-requested wait too — a long rate-limit reset window
            // would otherwise hang the request well past any sane timeout.
            const requested = serverRequestedDelayMs(error);
            const delayMs =
                requested !== undefined
                    ? Math.min(requested, maxDelayMs)
                    : backoffDelayMs(attempt, baseDelayMs, maxDelayMs);

            onRetry?.({
                attempt,
                maxAttempts,
                delayMs,
                reason: describe(error),
                status: (error as HttpishError)?.status,
            });

            await sleep(delayMs);
        }
    }

    throw lastError;
}
