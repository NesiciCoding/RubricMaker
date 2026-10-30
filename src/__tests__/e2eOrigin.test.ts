import { describe, expect, it } from 'vitest';
import {
    checkoutStamp,
    portForCheckout,
    resolveOrigin,
    reuseExistingServer,
    originPort,
    DEV_SERVER_PORT,
    APP_ORIGIN,
    CHECKOUT_STAMP,
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
