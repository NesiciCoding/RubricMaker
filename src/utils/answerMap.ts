const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Returns a copy of `answers` with one key set, ignoring keys that would pollute the prototype. */
export function withAnswer(answers: Record<string, string>, key: string, value: string): Record<string, string> {
    const map = new Map(Object.entries(answers));
    if (!UNSAFE_KEYS.has(key)) map.set(key, value);
    return Object.fromEntries(map);
}
