/**
 * A simple per-key sliding-window rate limiter, in-memory.
 *
 * Deliberately not distributed: this resets on every deploy and is scoped
 * to a single server instance. That's a known limitation, not an oversight
 * — it's here to stop the agentic path (which spends real Gemini quota)
 * from being hammered by a single caller, not to be a hardened abuse
 * defense. A production deployment behind multiple instances would want a
 * shared store (Redis, etc.) instead.
 */

const hits = new Map<string, number[]>();

export interface RateLimitResult {
    limited: boolean;
    retryAfterSeconds?: number;
}

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const timestamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

    if (timestamps.length >= maxRequests) {
        const oldestInWindow = timestamps[0];
        const retryAfterSeconds = Math.ceil((windowMs - (now - oldestInWindow)) / 1000);
        hits.set(key, timestamps); // don't record this rejected attempt as a new hit
        return { limited: true, retryAfterSeconds };
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    return { limited: false };
}
