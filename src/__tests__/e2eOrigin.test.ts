import { describe, expect, it, vi } from 'vitest';
import {
    checkoutStamp,
    portForCheckout,
    resolveOrigin,
    reuseExistingServer,
    originPort,
    DEV_SERVER_PORT,
    APP_ORIGIN,
    CHECKOUT_STAMP,
    loopbackCandidates,
    readCheckoutStamp,
} from '../../e2e/appUrl';

// The e2e suite can only be trusted if its origin is this checkout's own server (#1015): a fixed
// port meant a second worktree's dev server answered, and every spec passed against its code.
describe('e2e origin', () => {
    it('derives a stable, checkout-specific port', () => {
        expect(checkoutStamp('/work/app')).toBe(checkoutStamp('/work/app'));
        expect(checkoutStamp('/work/app')).not.toBe(checkoutStamp('/work/app-2'));
        expect(portForCheckout('/work/app')).toBe(portForCheckout('/work/app'));
        expect(portForCheckout('/work/app')).not.toBe(portForCheckout('/work/app-2'));
        for (const root of ['/work/app', '/work/app-2', '/Users/dev/checkouts/rubricmaker']) {
            const port = portForCheckout(root);
            expect(port).toBeGreaterThanOrEqual(5173);
            expect(port).toBeLessThan(5573);
        }
    });

    it('keeps the historical port for the checkout whose stamp hashes to 0', () => {
        // 5173 + (0 % 400); asserted through the public helper so the offset can't drift silently.
        expect(portForCheckout('/work/app') - 5173).toBeLessThan(400);
    });

    it('lets E2E_PORT override the derived port and E2E_BASE_URL override the whole origin', () => {
        expect(resolveOrigin('/work/app', {})).toBe(`http://localhost:${portForCheckout('/work/app')}`);
        expect(resolveOrigin('/work/app', { E2E_PORT: '6000' })).toBe('http://localhost:6000');
        expect(resolveOrigin('/work/app', { E2E_BASE_URL: 'https://preview.example.test/' })).toBe(
            'https://preview.example.test'
        );
    });

    it('never reuses an existing server unless reuse is asked for explicitly', () => {
        expect(reuseExistingServer({})).toBe(false);
        expect(reuseExistingServer({ CI: 'true' })).toBe(false);
        expect(reuseExistingServer({ E2E_REUSE_SERVER: 'true' })).toBe(false);
        expect(reuseExistingServer({ E2E_REUSE_SERVER: '1' })).toBe(true);
    });

    it('exposes the resolved origin for this checkout', () => {
        expect(APP_ORIGIN).toBe(resolveOrigin(process.cwd(), process.env));
        expect(CHECKOUT_STAMP).toHaveLength(12);
    });

    // `playwright.config.ts` starts the dev server on this port, so it has to be the port of
    // whichever origin is in play — including an external one, which carries none.
    it('takes the port from the resolved origin in every mode', () => {
        expect(originPort(resolveOrigin('/work/app', {}))).toBe(portForCheckout('/work/app'));
        expect(originPort(resolveOrigin('/work/app', { E2E_PORT: '6000' }))).toBe(6000);
        expect(originPort('https://preview.example.test')).toBe(80);
        expect(DEV_SERVER_PORT).toBe(originPort(APP_ORIGIN));
    });
});

// A dev server binds one address family; `localhost` can resolve to the other one. The identity
// check therefore probes both, or CI turns a live server into ECONNREFUSED (#1015).
describe('checkout identity probe', () => {
    function response(stamp?: string): Response {
        return new Response('<html></html>', {
            status: 200,
            headers: stamp ? { 'x-rm-checkout': stamp } : {},
        });
    }

    it('probes the configured origin first, then both loopback families', () => {
        expect(loopbackCandidates('http://localhost:5324')).toEqual([
            'http://localhost:5324',
            'http://127.0.0.1:5324',
            'http://[::1]:5324',
        ]);
        // Already an alias: no duplicate of the configured spelling.
        expect(loopbackCandidates('http://127.0.0.1:5324')).toEqual(['http://127.0.0.1:5324', 'http://[::1]:5324']);
        // An external origin is used verbatim — no loopback guessing.
        expect(loopbackCandidates('https://preview.example.test')).toEqual(['https://preview.example.test']);
    });

    it('finds the stamp when the server answers on only one address family', async () => {
        // The exact CI shape: `localhost` and `127.0.0.1` refuse, `[::1]` is the one that answers.
        const fetchImpl = vi.fn(async (url: string) => {
            if (url === 'http://[::1]:5324') return response('stamp-on-ipv6');
            throw new Error(`connect ECONNREFUSED ${new URL(url).host}`);
        }) as unknown as typeof fetch;

        await expect(readCheckoutStamp('http://localhost:5324', { fetchImpl })).resolves.toEqual({
            served: 'stamp-on-ipv6',
            origin: 'http://[::1]:5324',
        });
    });

    it('retries while the dev server is still booting', async () => {
        // The whole first round (all three loopback spellings) refuses, then the server is up.
        let calls = 0;
        const fetchImpl = vi.fn(async (url: string) => {
            calls++;
            if (calls <= 3) throw new Error(`connect ECONNREFUSED ${new URL(url).host}`);
            return response('late-stamp');
        }) as unknown as typeof fetch;

        const check = await readCheckoutStamp('http://localhost:5324', { attempts: 5, delayMs: 1, fetchImpl });
        expect(check).toEqual({ served: 'late-stamp', origin: 'http://localhost:5324' });
        expect(calls).toBe(4);
    });

    it('reports a missing stamp as null instead of failing — that is a mismatch, not silence', async () => {
        const fetchImpl = vi.fn(async () => response()) as unknown as typeof fetch;
        await expect(readCheckoutStamp('http://localhost:5324', { fetchImpl })).resolves.toEqual({
            served: null,
            origin: 'http://localhost:5324',
        });
    });

    it('gives up after the attempt budget and surfaces the last error', async () => {
        const fetchImpl = vi.fn(async (url: string) => {
            throw new Error(`connect ECONNREFUSED ${new URL(url).host}`);
        }) as unknown as typeof fetch;

        await expect(
            readCheckoutStamp('http://localhost:5324', { attempts: 3, delayMs: 1, fetchImpl })
        ).rejects.toThrow(/ECONNREFUSED/);
        // 3 attempts × 3 loopback spellings: bounded, so a dead server still fails quickly.
        expect(fetchImpl).toHaveBeenCalledTimes(9);
    });
});
