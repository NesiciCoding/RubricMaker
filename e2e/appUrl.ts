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

/**
 * Port of an origin, with the default for the scheme when it has no explicit one. An external
 * `E2E_BASE_URL` usually carries no port (`https://preview.example.test`), so this is the branch
 * the assertions in `e2eOrigin.test.ts` have to exercise rather than assume the local shape.
 */
export function originPort(origin: string): number {
    return Number(new URL(origin).port || '80');
}

export const DEV_SERVER_PORT = originPort(APP_ORIGIN);

function isLoopbackHost(hostname: string): boolean {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

/**
 * Every spelling of a loopback origin worth probing, the configured one first.
 *
 * `localhost` resolves to whichever address family the resolver lists first (`::1` on many Linux
 * images, `127.0.0.1` elsewhere) and a dev server started with `--host` binds exactly one of them.
 * The HTTP clients involved disagree about falling back: Playwright's readiness probe tries both
 * families, while Node's `fetch` (undici) can go straight for one. A single-family server plus a
 * client that picks the other address is a refused connection even though the server is up — which
 * is how the check failed in CI (#1015: the probe had reached the dev server, then `fetch` to
 * `127.0.0.1:5324` was refused). The stamp is the identity that matters, so probe the loopback
 * aliases too rather than trust one address.
 */
export function loopbackCandidates(origin: string): string[] {
    const url = new URL(origin);
    if (!isLoopbackHost(url.hostname)) return [origin];
    const port = url.port ? `:${url.port}` : '';
    return [...new Set([origin, `${url.protocol}//127.0.0.1${port}`, `${url.protocol}//[::1]${port}`])];
}

export interface OriginCheck {
    /** Value of the `x-rm-checkout` header, or null when the server answered without one. */
    served: string | null;
    /** The spelling of the origin that answered. */
    origin: string;
}

/**
 * Read the checkout stamp a server advertises, retrying while the dev server comes up.
 *
 * One un-retried request is a race by construction: `globalSetup` runs immediately after
 * Playwright's readiness probe, but through a different HTTP client (see `loopbackCandidates`).
 * Bounded retries keep the guard strict about *identity* while giving a boot window and an
 * address-family split room to resolve; a genuinely wrong (or absent) server still fails.
 *
 * Returns as soon as any candidate answers — a missing header is `null`, not an error.
 */
export async function readCheckoutStamp(
    origin: string,
    {
        attempts = 1,
        delayMs = 0,
        fetchImpl = fetch,
    }: { attempts?: number; delayMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<OriginCheck> {
    const candidates = loopbackCandidates(origin);
    let lastError: unknown = new Error(`nothing answered at ${origin}`);

    for (let attempt = 1; attempt <= attempts; attempt++) {
        for (const candidate of candidates) {
            try {
                const response = await fetchImpl(candidate, { headers: { accept: 'text/html' } });
                // Drain the body so the socket is released before the next probe.
                if (typeof response.text === 'function') await response.text().catch(() => '');
                return { served: response.headers.get('x-rm-checkout'), origin: candidate };
            } catch (error) {
                lastError = error;
            }
        }
        if (attempt < attempts && delayMs > 0) {
            await new Promise((done) => setTimeout(done, delayMs));
        }
    }

    throw lastError;
}
