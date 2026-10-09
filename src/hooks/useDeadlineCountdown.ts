import { useCallback, useEffect, useRef, useState } from 'react';
import { loadTestTimer, loadTimerDeadline, saveTimerDeadline } from '../store/storage';

interface Options {
    /** null → no countdown is active. */
    durationMinutes: number | null;
    /** Persistence key; the deadline survives reloads and closing the tab. */
    storageKey: string;
    /** Stops the countdown and time-up (e.g. once the work is submitted). */
    stopped: boolean;
    /** Bump to start a fresh countdown (e.g. a retake, after clearing the stored timer). */
    resetSignal?: number;
    /** Called once when the deadline passes — also right after a reload past the deadline. */
    onTimeUp?: () => void;
}

/**
 * Wall-clock exam countdown. Remaining time is derived from a persisted absolute deadline rather
 * than from counting interval ticks, which browsers pause or throttle while a device sleeps or a
 * tab is in the background. Returns the remaining whole seconds, or null without a time limit.
 */
export function useDeadlineCountdown({
    durationMinutes,
    storageKey,
    stopped,
    resetSignal = 0,
    onTimeUp,
}: Options): number | null {
    const resolveDeadline = useCallback((): number | null => {
        if (durationMinutes == null) return null;
        const stored = loadTimerDeadline(storageKey);
        if (stored !== null) return stored;
        // Sessions started before deadlines were persisted only kept the remaining seconds.
        const remaining = loadTestTimer(storageKey) ?? durationMinutes * 60;
        const endsAt = Date.now() + remaining * 1000;
        saveTimerDeadline(storageKey, endsAt);
        return endsAt;
    }, [durationMinutes, storageKey]);

    const [endsAt, setEndsAt] = useState<number | null>(resolveDeadline);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        setEndsAt(resolveDeadline());
        setNow(Date.now());
    }, [resolveDeadline, resetSignal]);

    const secondsLeft = endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now) / 1000));
    const expired = secondsLeft === 0;

    useEffect(() => {
        if (endsAt === null || stopped || expired) return;
        const tick = () => setNow(Date.now());
        const id = setInterval(tick, 1000);
        document.addEventListener('visibilitychange', tick);
        window.addEventListener('focus', tick);
        return () => {
            clearInterval(id);
            document.removeEventListener('visibilitychange', tick);
            window.removeEventListener('focus', tick);
        };
    }, [endsAt, stopped, expired]);

    const onTimeUpRef = useRef(onTimeUp);
    useEffect(() => {
        onTimeUpRef.current = onTimeUp;
    }, [onTimeUp]);

    const firedForRef = useRef<number | null>(null);
    useEffect(() => {
        if (!expired || stopped || endsAt === null || firedForRef.current === endsAt) return;
        firedForRef.current = endsAt;
        onTimeUpRef.current?.();
    }, [expired, stopped, endsAt]);

    return secondsLeft;
}
