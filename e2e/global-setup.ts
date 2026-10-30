import type { FullConfig } from '@playwright/test';
import { APP_ORIGIN, CHECKOUT_ROOT, CHECKOUT_STAMP, loopbackCandidates, readCheckoutStamp } from './appUrl';

/** How long the guard keeps probing for the server: 40 × 250 ms ≈ 10 s. */
const STAMP_ATTEMPTS = 40;
const STAMP_RETRY_MS = 250;

/**
 * Refuse to run against a server that isn't serving this checkout (#1015).
 *
 * `reuseExistingServer` never catches this on its own: the suite used to point at a fixed port, so
 * a second worktree's dev server answered there and every spec passed against the wrong code.
 *
 * The probe retries rather than firing once. It runs right after Playwright's own readiness check,
 * which uses a different HTTP client: in CI that check reached the dev server, then `fetch` to
 * `127.0.0.1` was refused, and a single attempt turned that into a red run before a single spec
 * executed. Retrying — across the loopback aliases — keeps the identity assertion strict without
 * making it a timing race.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
    if (process.env.E2E_BASE_URL) {
        // An explicit origin is an explicit choice (a deployed preview, a remote stack).
        console.log(`e2e: using E2E_BASE_URL ${APP_ORIGIN} (checkout identity not asserted)`);
        return;
    }

    let served: string | null;
    let answeredAt: string;
    try {
        const check = await readCheckoutStamp(APP_ORIGIN, {
            attempts: STAMP_ATTEMPTS,
            delayMs: STAMP_RETRY_MS,
        });
        served = check.served;
        answeredAt = check.origin;
    } catch (error) {
        const tried = loopbackCandidates(APP_ORIGIN).join(', ');
        throw new Error(
            `e2e: nothing answered at ${APP_ORIGIN} after ${STAMP_ATTEMPTS} attempts (tried ${tried}) — ` +
                `${(error as Error).message}`,
            { cause: error }
        );
    }

    if (served !== CHECKOUT_STAMP) {
        throw new Error(
            [
                `e2e: ${answeredAt} is not serving this checkout — refusing to run.`,
                `  this checkout: ${CHECKOUT_ROOT} (stamp ${CHECKOUT_STAMP})`,
                `  server stamp:  ${served ?? '<none>'}`,
                '',
                "Something else is answering on this port, usually another worktree's dev server,",
                'and every spec would test that code instead. Stop it, or choose a free port with',
                'E2E_PORT=<n> (or point the suite elsewhere with E2E_BASE_URL=<origin>).',
            ].join('\n')
        );
    }
}
