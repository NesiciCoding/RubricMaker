import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/**
 * Where the e2e suite talks to, and how it proves that origin serves *this* checkout (#1015).
 *
 * A suite that blindly uses `http://localhost:5173` tests whatever happens to answer there. On a
 * machine with several worktrees that was another checkout's dev server, so the run passed while
 * exercising someone else's code — a false green that no assertion could catch.
 */

/** Root of this checkout: the e2e suite runs from the repo root via the npm scripts. */
export const CHECKOUT_ROOT = resolve(process.env.E2E_CHECKOUT_ROOT ?? process.cwd());

/**
 * Short, stable fingerprint of a checkout path. The dev server advertises it in the
 * `x-rm-checkout` response header (see `vite.config.ts`) and `e2e/global-setup.ts` compares it,
 * so "another worktree's server is answering on our port" is a loud failure.
 */
export function checkoutStamp(root: string): string {
    return createHash('sha1').update(root).digest('hex').slice(0, 12);
}

/**
 * Port for the dev server this checkout starts: 5173 for the first checkout, a stable neighbour for
 * any other worktree, so two suites can run side by side without sharing a server.
 */
export function portForCheckout(root: string): number {
    return 5173 + (parseInt(checkoutStamp(root).slice(0, 4), 16) % 400);
}

/**
 * Whether Playwright may attach to a server that is already listening.
 *
 * Opt-in only: defaulting this to `!process.env.CI` is what let another checkout's dev server
 * answer on the shared port and turn every spec into a false green (#1015).
 */
export function reuseExistingServer(env: Record<string, string | undefined>): boolean {
    return env.E2E_REUSE_SERVER === '1';
}

/** Origin for the suite: `E2E_BASE_URL` verbatim, else this checkout's local dev server. */
export function resolveOrigin(root: string, env: Record<string, string | undefined>): string {
    if (env.E2E_BASE_URL) return env.E2E_BASE_URL.replace(/\/+$/, '');
    return `http://localhost:${env.E2E_PORT ?? portForCheckout(root)}`;
}

export const CHECKOUT_STAMP = checkoutStamp(CHECKOUT_ROOT);

/** Origin every spec navigates to (`page.goto(`${APP_ORIGIN}/#/...`)`, not a hardcoded port). */
export const APP_ORIGIN = resolveOrigin(CHECKOUT_ROOT, process.env);

export const DEV_SERVER_PORT = Number(new URL(APP_ORIGIN).port || '80');
