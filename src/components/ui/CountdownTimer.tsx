import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { loadTestTimer, saveTestTimer } from '../../store/storage';

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

interface CountdownTimerProps {
    /** null → no countdown is active and nothing renders. */
    durationMinutes: number | null;
    /** Persistence key for the remaining seconds, so a reload resumes the countdown. */
    storageKey: string;
    /** Stops the ticking interval once the page is submitted. */
    submitted: boolean;
    /** Bump to restart the countdown from its full duration (e.g. a retake). */
    resetSignal?: number;
    /** Called once when the countdown reaches zero (e.g. auto-submit). */
    onTimeUp?: () => void;
    /** Label shown once time is up (e.g. "Time's up!"). */
    timeUpLabel: string;
}

/** Self-contained exam countdown: owns the remaining-seconds state and the 1Hz tick, so a
 *  per-second re-render is confined to this component instead of the whole page. */
export default function CountdownTimer({
    durationMinutes,
    storageKey,
    submitted,
    resetSignal = 0,
    onTimeUp,
    timeUpLabel,
}: CountdownTimerProps) {
    const [secondsLeft, setSecondsLeft] = useState<number | null>(() =>
        durationMinutes == null ? null : (loadTestTimer(storageKey) ?? durationMinutes * 60)
    );
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const onTimeUpRef = useRef(onTimeUp);
    useEffect(() => {
        onTimeUpRef.current = onTimeUp;
    }, [onTimeUp]);

    // (Re)initialise when the duration becomes known (async content fetch) or a retake resets it.
    useEffect(() => {
        setSecondsLeft(durationMinutes == null ? null : (loadTestTimer(storageKey) ?? durationMinutes * 60));
    }, [durationMinutes, resetSignal, storageKey]);

    useEffect(() => {
        if (secondsLeft === null || secondsLeft <= 0 || submitted) return;
        timerRef.current = setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev === null || prev <= 0) return prev;
                const next = prev - 1;
                saveTestTimer(storageKey, next);
                if (next <= 0 && timerRef.current) clearInterval(timerRef.current);
                return next;
            });
        }, 1000);
        return () => {
            /* v8 ignore next -- cleanup is only registered when the interval was set, so the ref is never null here */
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [secondsLeft === null, submitted, storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fire onTimeUp exactly when a tick brings the countdown to zero — never when a stored
    // value restores at zero. Kept out of the interval updater so the callback's setStates
    // run in the commit phase rather than during another component's render.
    const prevSecondsRef = useRef<number | null>(secondsLeft);
    useEffect(() => {
        const prev = prevSecondsRef.current;
        prevSecondsRef.current = secondsLeft;
        if (!submitted && secondsLeft !== null && prev !== null && prev > 0 && secondsLeft === 0) {
            onTimeUpRef.current?.();
        }
    }, [secondsLeft, submitted]);

    if (secondsLeft === null) return null;

    const timedOut = secondsLeft <= 0;
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 700,
                fontSize: '1.05rem',
                fontVariantNumeric: 'tabular-nums',
                color: secondsLeft < 120 ? '#ef4444' : 'var(--text)',
            }}
        >
            <Clock size={17} />
            {timedOut ? timeUpLabel : formatTime(secondsLeft)}
        </div>
    );
}
