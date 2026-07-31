'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `value` delayed by `delayMs`, resetting the timer on every change.
 *
 * Use this to throttle *derived work* (filtering, fetching) while leaving the
 * source input controlled and instant — debouncing the input value itself
 * makes typing feel laggy.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);

    return debounced;
}
