import type { FullConfig } from '@playwright/test';
import { APP_ORIGIN, CHECKOUT_ROOT, CHECKOUT_STAMP } from './appUrl';

/**
 * Refuse to run against a server that isn't serving this checkout (#1015).
 *
 * `reuseExistingServer` never catches this on its own: the suite used to point at a fixed port, so
 * a second worktree's dev server answered there and every spec passed against the wrong code.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
    if (process.env.E2E_BASE_URL) {
        // An explicit origin is an explicit choice (a deployed preview, a remote stack).
        console.log(`e2e: using E2E_BASE_URL ${APP_ORIGIN} (checkout identity not asserted)`);
        return;
    }

    let served: string | null;
    try {
        const response = await fetch(APP_ORIGIN, { headers: { accept: 'text/html' } });
        served = response.headers.get('x-rm-checkout');
    } catch (error) {
        throw new Error(`e2e: nothing answered at ${APP_ORIGIN} (${(error as Error).message})`, { cause: error });
    }

    if (served !== CHECKOUT_STAMP) {
        throw new Error(
            [
                `e2e: ${APP_ORIGIN} is not serving this checkout — refusing to run.`,
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
