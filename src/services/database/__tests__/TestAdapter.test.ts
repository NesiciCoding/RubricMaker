import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestAdapter } from '../TestAdapter';

const mockSession = { access_token: 'token-123', user: { id: 'user-1' } };

const mockAuth = {
    getSession: vi.fn(),
    signInAnonymously: vi.fn(),
};
const mockClient = { auth: mockAuth };

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => mockClient),
}));

function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
    } as Response;
}

describe('TestAdapter', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockAuth.getSession.mockReset();
        mockAuth.signInAnonymously.mockReset();
    });

    describe('ensureSession', () => {
        it('signs in anonymously when no session exists', async () => {
            mockAuth.getSession.mockResolvedValue({ data: { session: null } });
            mockAuth.signInAnonymously.mockResolvedValue({ data: { session: mockSession }, error: null });

            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');
            const result = await adapter.ensureSession();

            expect(result).toEqual({ ok: true });
            expect(mockAuth.signInAnonymously).toHaveBeenCalledTimes(1);
        });

        it('reuses an existing session without signing in again', async () => {
            mockAuth.getSession.mockResolvedValue({ data: { session: mockSession } });

            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');
            const result = await adapter.ensureSession();

            expect(result).toEqual({ ok: true });
            expect(mockAuth.signInAnonymously).not.toHaveBeenCalled();
        });

        it('surfaces the error when anonymous sign-in fails', async () => {
            mockAuth.getSession.mockResolvedValue({ data: { session: null } });
            mockAuth.signInAnonymously.mockResolvedValue({
                data: { session: null },
                error: { message: 'Anonymous sign-ins are disabled' },
            });

            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');
            const result = await adapter.ensureSession();

            expect(result).toEqual({ ok: false, error: 'Anonymous sign-ins are disabled' });
        });
    });

    describe('fetchAssignmentContent', () => {
        it('returns unauthenticated when there is no session', async () => {
            mockAuth.getSession.mockResolvedValue({ data: { session: null } });
            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');

            const result = await adapter.fetchAssignmentContent('assignment-1');

            expect(result).toEqual({ ok: false, reason: 'unauthenticated' });
        });

        it('posts to get-test-assignment with the bearer token and returns the test content', async () => {
            mockAuth.getSession.mockResolvedValue({ data: { session: mockSession } });
            const contentBody = {
                testId: 't1',
                studentId: 's1',
                requireSEB: false,
                durationMinutes: null,
                expiresAt: null,
                test: { id: 't1', name: 'Quiz', questions: [] },
            };
            const fetchMock = vi.fn().mockResolvedValue(jsonResponse(contentBody));
            vi.stubGlobal('fetch', fetchMock);

            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');
            const result = await adapter.fetchAssignmentContent('assignment-1');

            expect(result).toEqual({ ok: true, data: contentBody });
            expect(fetchMock).toHaveBeenCalledWith(
                'https://x.supabase.co/functions/v1/get-test-assignment',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        Authorization: 'Bearer token-123',
                        apikey: 'anon-key',
                    }),
                    body: JSON.stringify({ assignmentId: 'assignment-1' }),
                })
            );
        });

        it('returns invalid_response when the edge function body is missing required fields', async () => {
            mockAuth.getSession.mockResolvedValue({ data: { session: mockSession } });
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ test: { id: 't1', name: 'Quiz' } })));

            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');
            const result = await adapter.fetchAssignmentContent('assignment-1');

            expect(result).toEqual({ ok: false, reason: 'invalid_response' });
        });

        it.each([
            [404, 'not_found'],
            [410, 'expired'],
            [500, 'invalid_response'],
        ] as const)('maps a %d response to reason %s', async (status, reason) => {
            mockAuth.getSession.mockResolvedValue({ data: { session: mockSession } });
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, status)));

            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');
            const result = await adapter.fetchAssignmentContent('assignment-1');

            expect(result).toEqual({ ok: false, reason });
        });

        it('maps a network failure to reason network', async () => {
            mockAuth.getSession.mockResolvedValue({ data: { session: mockSession } });
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');
            const result = await adapter.fetchAssignmentContent('assignment-1');

            expect(result).toEqual({ ok: false, reason: 'network' });
        });
    });

    describe('submitTest', () => {
        it('returns an error when there is no session', async () => {
            mockAuth.getSession.mockResolvedValue({ data: { session: null } });
            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');

            const result = await adapter.submitTest('assignment-1', 'sub-1', [], '2026-01-01', '2026-01-02');

            expect(result).toEqual({ success: false, error: 'Not authenticated' });
        });

        it('posts to submit-test with the submission payload and returns success', async () => {
            mockAuth.getSession.mockResolvedValue({ data: { session: mockSession } });
            const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
            vi.stubGlobal('fetch', fetchMock);

            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');
            const answers = [{ questionId: 'q1', response: 'a' }];
            const result = await adapter.submitTest(
                'assignment-1',
                'sub-1',
                answers,
                '2026-01-01T00:00:00.000Z',
                '2026-01-01T00:10:00.000Z',
                []
            );

            expect(result).toEqual({ success: true });
            expect(fetchMock).toHaveBeenCalledWith(
                'https://x.supabase.co/functions/v1/submit-test',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
                    body: JSON.stringify({
                        assignmentId: 'assignment-1',
                        submissionId: 'sub-1',
                        answers,
                        startedAt: '2026-01-01T00:00:00.000Z',
                        submittedAt: '2026-01-01T00:10:00.000Z',
                        events: [],
                    }),
                })
            );
        });

        it('surfaces the server error message on a non-ok response', async () => {
            mockAuth.getSession.mockResolvedValue({ data: { session: mockSession } });
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(jsonResponse({ error: 'You have already submitted this assignment' }, 409))
            );

            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');
            const result = await adapter.submitTest('assignment-1', 'sub-1', [], '2026-01-01', '2026-01-02');

            expect(result).toEqual({ success: false, error: 'You have already submitted this assignment' });
        });

        it('returns a network error message when the request throws', async () => {
            mockAuth.getSession.mockResolvedValue({ data: { session: mockSession } });
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');
            const result = await adapter.submitTest('assignment-1', 'sub-1', [], '2026-01-01', '2026-01-02');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Network error');
        });
    });

    describe('nextPlacementQuestion', () => {
        it('returns an error when there is no session', async () => {
            mockAuth.getSession.mockResolvedValue({ data: { session: null } });
            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');

            const result = await adapter.nextPlacementQuestion('assignment-1');

            expect(result).toEqual({ ok: false, error: 'Not authenticated' });
        });

        it('posts to next-placement-question and returns a valid in-progress result', async () => {
            mockAuth.getSession.mockResolvedValue({ data: { session: mockSession } });
            const body = {
                done: false,
                question: { id: 'q1', type: 'multiple-choice', prompt: 'Pick one', points: 1 },
                cefrLevel: 'B1',
                eloAnchor: 1200,
                questionsAsked: 2,
            };
            const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
            vi.stubGlobal('fetch', fetchMock);

            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');
            const result = await adapter.nextPlacementQuestion('assignment-1', 'q0', 'a');

            expect(result).toEqual({ ok: true, data: body });
            expect(fetchMock).toHaveBeenCalledWith(
                'https://x.supabase.co/functions/v1/next-placement-question',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({
                        assignmentId: 'assignment-1',
                        previousQuestionId: 'q0',
                        previousResponse: 'a',
                    }),
                })
            );
        });

        it('returns a valid done result', async () => {
            mockAuth.getSession.mockResolvedValue({ data: { session: mockSession } });
            const body = { done: true, finalLevel: 'B2', questionsAsked: 8 };
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)));

            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');
            const result = await adapter.nextPlacementQuestion('assignment-1', 'q7', 'a');

            expect(result).toEqual({ ok: true, data: body });
        });

        it('rejects a malformed 2xx response instead of reporting success', async () => {
            mockAuth.getSession.mockResolvedValue({ data: { session: mockSession } });
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ done: false, question: { id: 'q1' } })));

            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');
            const result = await adapter.nextPlacementQuestion('assignment-1');

            expect(result).toEqual({ ok: false, error: 'Unexpected response from server' });
        });

        it('surfaces the server error message on a non-ok response', async () => {
            mockAuth.getSession.mockResolvedValue({ data: { session: mockSession } });
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(jsonResponse({ error: 'Session belongs to another student' }, 403))
            );

            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');
            const result = await adapter.nextPlacementQuestion('assignment-1');

            expect(result).toEqual({ ok: false, error: 'Session belongs to another student' });
        });

        it('returns a network error message when the request throws', async () => {
            mockAuth.getSession.mockResolvedValue({ data: { session: mockSession } });
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

            const adapter = new TestAdapter('https://x.supabase.co', 'anon-key');
            const result = await adapter.nextPlacementQuestion('assignment-1');

            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error).toContain('Network error');
        });
    });
});
