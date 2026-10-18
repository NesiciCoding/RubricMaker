import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { pingHeartbeat } from '../../supabase/functions/_shared/heartbeat';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

// #869: scheduled jobs failed silently; a heartbeat sent only after a clean run lets an external
// monitor alert on the missing ping.
describe('pingHeartbeat', () => {
    it('does nothing without a URL', async () => {
        const fetchFn = vi.fn();
        expect(await pingHeartbeat(undefined, fetchFn)).toBe(false);
        expect(await pingHeartbeat('', fetchFn)).toBe(false);
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it('pings an http(s) URL and reports whether the monitor accepted it', async () => {
        const ok = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }));
        expect(await pingHeartbeat('https://hc-ping.example/abc', ok)).toBe(true);
        expect(ok).toHaveBeenCalledWith('https://hc-ping.example/abc', expect.objectContaining({ method: 'GET' }));

        const rejected = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));
        expect(await pingHeartbeat('https://hc-ping.example/abc', rejected)).toBe(false);
    });

    it('never throws, so a monitor outage cannot fail the job that already succeeded', async () => {
        const failing = vi.fn().mockRejectedValue(new TypeError('network down'));
        await expect(pingHeartbeat('https://hc-ping.example/abc', failing)).resolves.toBe(false);
    });

    it('ignores malformed and non-http URLs instead of fetching them', async () => {
        const fetchFn = vi.fn();
        expect(await pingHeartbeat('not a url', fetchFn)).toBe(false);
        expect(await pingHeartbeat('file:///etc/passwd', fetchFn)).toBe(false);
        expect(fetchFn).not.toHaveBeenCalled();
    });
});

describe('scheduled jobs ping only after a clean run', () => {
    it.each([
        ['nightly-backup', 'NIGHTLY_BACKUP_HEARTBEAT_URL', 'if (errors.length === 0)'],
        ['delete-old-attachments', 'CLEANUP_HEARTBEAT_URL', 'if (failed.length === 0)'],
        ['scheduled-digest', 'DIGEST_HEARTBEAT_URL', 'if (errors.length === 0)'],
    ])('%s', (fn, envVar, guard) => {
        const source = read(`supabase/functions/${fn}/index.ts`);
        expect(source).toContain(`from '../_shared/heartbeat.ts'`);
        expect(source).toContain(`${guard} await pingHeartbeat(Deno.env.get('${envVar}'))`);
    });

    it('scripts/delete-old-attachments.sh pings after the failure exit', () => {
        const script = read('scripts/delete-old-attachments.sh');
        const failExit = script.lastIndexOf('exit 1');
        const ping = script.indexOf('"$CLEANUP_HEARTBEAT_URL"');
        expect(ping).toBeGreaterThan(failExit);
    });
});
