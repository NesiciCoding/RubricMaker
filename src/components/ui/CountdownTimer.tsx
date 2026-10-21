import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { useDeadlineCountdown } from '../../hooks/useDeadlineCountdown';

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

const FIVE_MINUTES = 5 * 60;
const ONE_MINUTE = 60;

interface CountdownTimerProps {
    /** null → no countdown is active and nothing renders. */
    durationMinutes: number | null;
    /** Persistence key for the deadline, so a reload or reopened tab resumes the countdown. */
    storageKey: string;
    /** Stops the ticking interval once the page is submitted. */
    submitted: boolean;
    /** Bump to restart the countdown from its full duration (e.g. a retake). */
    resetSignal?: number;
    /** Called once when the deadline passes (e.g. auto-submit), also after a reload past it. */
    onTimeUp?: () => void;
    /** Label shown once time is up (e.g. "Time's up!"). */
    timeUpLabel: string;
}

/** Self-contained exam countdown: owns the per-second re-render so it is confined to this component
 *  instead of the whole page. Time is wall-clock based (see useDeadlineCountdown). */
export default function CountdownTimer({
    durationMinutes,
    storageKey,
    submitted,
    resetSignal = 0,
    onTimeUp,
    timeUpLabel,
}: CountdownTimerProps) {
    const { t } = useTranslation();
    const secondsLeft = useDeadlineCountdown({
        durationMinutes,
        storageKey,
        stopped: submitted,
        resetSignal,
        onTimeUp,
    });

    // Tracks which thresholds have already been announced for the current deadline, so a
    // screen reader hears each one once rather than on every tick once it's crossed.
    const announcedRef = useRef<Set<number>>(new Set());
    const [announcement, setAnnouncement] = useState('');

    useEffect(() => {
        announcedRef.current = new Set();
        setAnnouncement('');
    }, [resetSignal, storageKey]);

    useEffect(() => {
        if (secondsLeft === null) return;
        if (secondsLeft <= FIVE_MINUTES && !announcedRef.current.has(FIVE_MINUTES)) {
            announcedRef.current.add(FIVE_MINUTES);
            setAnnouncement(t('tests.taking.time_remaining_5min'));
        }
        if (secondsLeft <= ONE_MINUTE && !announcedRef.current.has(ONE_MINUTE)) {
            announcedRef.current.add(ONE_MINUTE);
            setAnnouncement(t('tests.taking.time_remaining_1min'));
        }
        if (secondsLeft <= 0 && !announcedRef.current.has(0)) {
            announcedRef.current.add(0);
            setAnnouncement(t('tests.taking.time_up_announcement'));
        }
    }, [secondsLeft, t]);

    if (secondsLeft === null) return null;

    const timedOut = secondsLeft <= 0;
    return (
        <>
            <div
                role="timer"
                aria-live="off"
                aria-label={t('tests.taking.time_remaining_label')}
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
                <Clock size={17} aria-hidden="true" />
                {timedOut ? timeUpLabel : formatTime(secondsLeft)}
            </div>
            <div role="status" aria-live="polite" className="sr-only">
                {announcement}
            </div>
        </>
    );
}
