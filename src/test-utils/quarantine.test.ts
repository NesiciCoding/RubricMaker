import { afterEach, describe, expect, it, vi } from 'vitest';
import { isQuarantined } from './quarantine';

// The real quarantine-unit.json is empty in the repo; stub it so the
// "on the list" path of isQuarantined is exercised.
vi.mock('../../quarantine-unit.json', () => ({
    default: [{ id: 'flaky test', file: 'src/utils/example.test.ts', reason: 'probe', since: '2026-08-01' }],
}));

describe('isQuarantined', () => {
    afterEach(() => {
        delete process.env.QUARANTINE_DISABLED;
    });

    it('returns true for an id that is on the quarantine list', () => {
        expect(isQuarantined('flaky test')).toBe(true);
    });

    it('returns false for an id that is not on the quarantine list', () => {
        expect(isQuarantined('unknown test')).toBe(false);
    });

    it('returns false for every id when QUARANTINE_DISABLED=1 forces quarantined tests to run', () => {
        process.env.QUARANTINE_DISABLED = '1';
        expect(isQuarantined('flaky test')).toBe(false);
        expect(isQuarantined('unknown test')).toBe(false);
    });
});
