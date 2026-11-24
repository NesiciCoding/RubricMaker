import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LogRow } from './clientLogger';

async function load(flags: { stress?: boolean; errors?: boolean }) {
    vi.resetModules();
    vi.stubEnv('VITE_STRESS_TEST_LOGGING', flags.stress ? 'true' : '');
    vi.stubEnv('VITE_ERROR_REPORTING', flags.errors ? 'true' : '');
    const logger = await import('./clientLogger');
    const inserted: LogRow[] = [];
    const client = {
        from: (table: string) => {
            expect(table).toBe('client_logs');
            return {
                insert: (rows: LogRow[]) => {
                    inserted.push(...rows);
                    return Promise.resolve({ error: null });
                },
            };
        },
    } as unknown as SupabaseClient;
    logger.initClientLogger(client, { role: 'teacher' });
    const flush = () => window.dispatchEvent(new Event('beforeunload'));
    return { logger, inserted, flush };
}

describe('errors-only client reporting (#870)', () => {
    beforeEach(() => {
        window.location.hash = '#/rubrics/V1StGXR8_Z5jdHi6B-myT/grade';
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        window.location.hash = '';
    });

    it('records nothing when neither flag is set', async () => {
        const { logger, inserted, flush } = await load({});

        logger.logError('window_error', new Error('boom'));
        logger.logEvent('error', 'x');
        flush();

        expect(inserted).toEqual([]);
    });

    it('keeps non-error categories off in errors-only mode', async () => {
        const { logger, inserted, flush } = await load({ errors: true });

        logger.logEvent('action', 'grade_saved', { count: 1 });
        logger.logEvent('pageview', 'pageview');
        logger.logEvent('sync', 'hydrate', { error: 'x' }, 'error');
        logger.logMetric('lcp', 1200);
        flush();

        expect(inserted).toEqual([]);
    });

    it('records an error row with the hashed message, own frames, normalised route, role and release', async () => {
        const { logger, inserted, flush } = await load({ errors: true });
        const error = new TypeError("Cannot read properties of undefined (reading 'Anna Jansen')");
        error.stack = `TypeError: x\n    at f (${window.location.origin}/assets/index-abc.js:10:20)`;

        logger.logError('unhandled_rejection', error);
        flush();

        expect(inserted).toHaveLength(1);
        const row = inserted[0];
        expect(row).toMatchObject({
            category: 'error',
            level: 'error',
            name: 'unhandled_rejection',
            role: 'teacher',
            path: '/rubrics/:id/grade',
            app_version: expect.any(String),
        });
        expect(row.meta).toMatchObject({
            errorName: 'TypeError',
            frames: ['assets/index-abc.js:10:20'],
        });
        expect(JSON.stringify(row)).not.toMatch(/Anna|Jansen|V1StGXR8/);
    });

    it('scrubs free text out of error rows from callers that predate the sanitiser', async () => {
        const { logger, inserted, flush } = await load({ errors: true });

        logger.logEvent('error', 'legacy', { message: 'Anna typed an answer here', teacherKey: 'key_1', count: 2 });
        flush();

        expect(inserted[0].meta).toEqual({ teacherKey: 'key_1', count: 2 });
    });

    it('drops a repeat of the same failure in one session', async () => {
        const { logger, inserted, flush } = await load({ errors: true });
        const make = () => new Error('same failure');

        logger.logError('window_error', make());
        logger.logError('window_error', make());
        flush();

        expect(inserted).toHaveLength(1);
    });

    it('caps a session at 20 error rows', async () => {
        const { logger, inserted, flush } = await load({ errors: true });

        for (let i = 0; i < 50; i++) logger.logError('window_error', new Error(`failure kind ${'x'.repeat(i + 1)}`));
        flush();

        expect(inserted.length).toBeLessThanOrEqual(20);
        expect(inserted.length).toBeGreaterThan(0);
    });

    it('leaves stress-test mode recording everything, uncapped and unscrubbed', async () => {
        const { logger, inserted, flush } = await load({ stress: true });

        logger.logEvent('action', 'grade_saved', { note: 'free text stays in stress mode' });
        for (let i = 0; i < 30; i++) logger.logEvent('error', `e${i}`, { message: 'has spaces' }, 'error');
        flush();

        expect(inserted.some((row) => row.category === 'action')).toBe(true);
        expect(inserted.filter((row) => row.category === 'error')).toHaveLength(30);
        expect(inserted.find((row) => row.category === 'error')?.meta).toEqual({ message: 'has spaces' });
    });
});
