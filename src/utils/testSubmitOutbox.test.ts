import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    enqueueSubmission,
    removeSubmission,
    pendingSubmissions,
    isAlreadySubmitted,
    type OutboxSubmission,
} from './testSubmitOutbox';

const base: OutboxSubmission = {
    id: 'sub-1',
    assignmentId: 'asg-1',
    supabaseUrl: 'https://a.example',
    supabaseAnonKey: 'anon',
    answers: [{ questionId: 'q1', response: 'x' }],
    startedAt: '2026-01-01T00:00:00Z',
    submittedAt: '2026-01-01T00:05:00Z',
    queuedAt: '2026-01-01T00:05:00Z',
};

describe('testSubmitOutbox', () => {
    beforeEach(() => localStorage.clear());

    it('enqueues, lists by project, and removes', () => {
        enqueueSubmission(base);
        enqueueSubmission({ ...base, id: 'sub-2', supabaseUrl: 'https://b.example' });
        expect(pendingSubmissions('https://a.example').map((s) => s.id)).toEqual(['sub-1']);
        removeSubmission('sub-1');
        expect(pendingSubmissions('https://a.example')).toEqual([]);
    });

    it('re-enqueuing the same id replaces rather than duplicates', () => {
        enqueueSubmission(base);
        enqueueSubmission({ ...base, submittedAt: '2026-01-01T00:06:00Z' });
        const all = pendingSubmissions('https://a.example');
        expect(all).toHaveLength(1);
        expect(all[0].submittedAt).toBe('2026-01-01T00:06:00Z');
    });

    it('treats the server 409 message as already-submitted', () => {
        expect(isAlreadySubmitted('You have already submitted this assignment')).toBe(true);
        expect(isAlreadySubmitted('Network error: TypeError')).toBe(false);
        expect(isAlreadySubmitted(undefined)).toBe(false);
    });

    it('keeps a queued hand-in in memory when localStorage.setItem throws', () => {
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceeded');
        });
        enqueueSubmission(base);
        expect(pendingSubmissions(base.supabaseUrl).map((s) => s.id)).toEqual(['sub-1']);
        spy.mockRestore();
        removeSubmission('sub-1'); // persists now, clearing the in-memory mirror
        expect(pendingSubmissions(base.supabaseUrl)).toEqual([]);
    });
});
