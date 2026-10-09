import { Clock } from 'lucide-react';
import { useDeadlineCountdown } from '../../hooks/useDeadlineCountdown';

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
    const secondsLeft = useDeadlineCountdown({
        durationMinutes,
        storageKey,
        stopped: submitted,
        resetSignal,
        onTimeUp,
    });

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
