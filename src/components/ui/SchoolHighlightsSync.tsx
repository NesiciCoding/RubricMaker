import { useEffect } from 'react';
import { useStore } from '../../context/useStore';
import { getDb } from '../../services/database/lazyDb';
import { logError } from '../../services/logging/clientLogger';
import { buildSchoolHighlightsSnapshot } from '../../utils/schoolHighlights';

const FIRST_PUSH_DELAY_MS = 45_000;
const PUSH_INTERVAL_MS = 6 * 60 * 60 * 1000;

const whenIdle = () =>
    new Promise<void>((resolve) => {
        if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 5000 });
        else setTimeout(resolve, 0);
    });

export function SchoolHighlightsSync() {
    const store = useStore();

    useEffect(() => {
        let lastPushed = '';
        let running = false;

        const push = async () => {
            if (running) return;
            const mayShare = () => {
                const { settings } = store.getState();
                return settings.shareSchoolHighlights !== false && settings.userRole !== 'student';
            };
            if (!mayShare()) return;
            const db = getDb();
            const adapter = db?.SchoolHighlightsAdapter.forTeacher();
            const ownerId = db?.storageSync.getCurrentUserId();
            if (!adapter || !ownerId) return;

            running = true;
            try {
                await whenIdle();
                if (!mayShare()) return;
                const snapshot = buildSchoolHighlightsSnapshot(store.getState());
                const today = new Date().toISOString().slice(0, 10);
                const key = today + JSON.stringify(snapshot);
                if (key === lastPushed) return;
                await adapter.push(ownerId, snapshot, today);
                lastPushed = key;
            } catch (err) {
                logError('school_highlights_push_failed', err);
            } finally {
                running = false;
            }
        };

        const first = setTimeout(push, FIRST_PUSH_DELAY_MS);
        const interval = setInterval(push, PUSH_INTERVAL_MS);
        return () => {
            clearTimeout(first);
            clearInterval(interval);
        };
    }, [store]);

    return null;
}
