import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPageTourSteps, type PageTourId } from '../data/PageTourSteps';

interface PageTourOptions {
    /** localStorage key remembering that the user has seen this tour; enables run-once-automatically. */
    seenKey?: string;
    /** Auto-run only while true (e.g. once the page content has loaded). Ignored without seenKey. */
    autoRun?: boolean;
}

const AUTO_RUN_DELAY_MS = 400;

function readSeen(key: string): boolean {
    try {
        return localStorage.getItem(key) === 'true';
    } catch {
        return false;
    }
}

function writeSeen(key: string) {
    try {
        localStorage.setItem(key, 'true');
    } catch {
        /* storage unavailable: the tour may show again next visit */
    }
}

export function usePageTourState(id: PageTourId, { seenKey, autoRun = false }: PageTourOptions = {}) {
    const { t } = useTranslation();
    const [manual, setManual] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [settled, setSettled] = useState(false);
    const steps = useMemo(() => getPageTourSteps(t, id), [t, id]);

    // Steps are filtered against the DOM when the tour starts, so give freshly loaded content a moment to paint.
    useEffect(() => {
        if (!seenKey || !autoRun) return;
        const timer = setTimeout(() => setSettled(true), AUTO_RUN_DELAY_MS);
        return () => clearTimeout(timer);
    }, [seenKey, autoRun]);

    const autoPending = !!seenKey && autoRun && settled && !dismissed && !readSeen(seenKey);
    const run = manual || autoPending;

    const start = useCallback(() => setManual(true), []);
    const finish = useCallback(() => {
        setManual(false);
        setDismissed(true);
        if (seenKey) writeSeen(seenKey);
    }, [seenKey]);

    return {
        start,
        tourProps: { steps, run, onFinish: finish, onStartRequest: start },
    };
}
