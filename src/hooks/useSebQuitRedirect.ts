import { useEffect } from 'react';
import { buildSebQuitUrl, isRunningInSEB, quitSafeExamBrowser } from '../utils/sebConfig';

export const SEB_QUIT_DELAY_MS = 2000;

/**
 * Navigates to the config's quit URL once the work is submitted, so a config with
 * allowQuit=false cannot leave the student locked in. Returns whether this page is running
 * inside SEB, which the manual quit button reuses.
 */
export function useSebQuitRedirect(
    submitted: boolean,
    quit: (quitUrl: string) => void = quitSafeExamBrowser,
    delayMs: number = SEB_QUIT_DELAY_MS
): boolean {
    const inSeb = isRunningInSEB();
    const quitUrl = buildSebQuitUrl();

    useEffect(() => {
        if (!submitted || !inSeb) return;
        const timer = window.setTimeout(() => quit(quitUrl), delayMs);
        return () => window.clearTimeout(timer);
    }, [submitted, inSeb, quitUrl, quit, delayMs]);

    return inSeb;
}
