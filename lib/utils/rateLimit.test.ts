import { describe, it, expect } from 'vitest';
import { checkRateLimit } from './rateLimit';

describe('checkRateLimit', () => {
    it('allows requests under the limit', () => {
        const key = `test-${Math.random()}`;
        expect(checkRateLimit(key, 3, 60_000).limited).toBe(false);
        expect(checkRateLimit(key, 3, 60_000).limited).toBe(false);
        expect(checkRateLimit(key, 3, 60_000).limited).toBe(false);
    });

    it('blocks once the limit is exceeded and reports a retry delay', () => {
        const key = `test-${Math.random()}`;
        checkRateLimit(key, 2, 60_000);
        checkRateLimit(key, 2, 60_000);

        const result = checkRateLimit(key, 2, 60_000);
        expect(result.limited).toBe(true);
        expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('tracks separate keys independently', () => {
        const keyA = `a-${Math.random()}`;
        const keyB = `b-${Math.random()}`;

        checkRateLimit(keyA, 1, 60_000);
        expect(checkRateLimit(keyA, 1, 60_000).limited).toBe(true);
        expect(checkRateLimit(keyB, 1, 60_000).limited).toBe(false);
    });
});
