export type GradeQueueSessionView = 'question' | 'student' | 'matrix';

export interface GradeQueueSession {
    version: 1;
    savedAt: string;
    view: GradeQueueSessionView;
    groupIndex: number;
    stepIndex: number;
    selectedIdx: number;
    draftPoints: Record<string, string>;
    feedbackDrafts: Record<string, string>;
    skipped: string[];
}

export type GradeQueueSessionState = Omit<GradeQueueSession, 'version' | 'savedAt'>;

export const GRADE_QUEUE_SESSION_VERSION = 1;

/** An unfinished session older than this is stale enough to be more confusing than helpful. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Guards the localStorage quota: a pathological amount of feedback should not fill it. */
const MAX_BYTES = 200_000;
const VIEWS: readonly GradeQueueSessionView[] = ['question', 'student', 'matrix'];

export function gradeQueueSessionKey(testId: string | null | undefined, userId: string | null | undefined): string {
    return `rm_grade_queue_session:${testId ?? 'none'}:${userId ?? 'local'}`;
}

function isIndex(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function stringMap(value: unknown): Record<string, string> | null {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const entries = Object.entries(value);
    if (!entries.every(([, entry]) => typeof entry === 'string')) return null;
    return Object.fromEntries(entries);
}

/** Reads a stored session, rejecting malformed, stale or unknown-version payloads instead of trusting them. */
export function parseGradeQueueSession(raw: string | null, now = Date.now()): GradeQueueSession | null {
    if (!raw) return null;
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return null;
    }
    if (value === null || typeof value !== 'object') return null;
    const session = value as Partial<GradeQueueSession>;
    if (session.version !== GRADE_QUEUE_SESSION_VERSION) return null;
    if (typeof session.savedAt !== 'string' || !(now - Date.parse(session.savedAt) <= MAX_AGE_MS)) return null;
    if (!VIEWS.includes(session.view as GradeQueueSessionView)) return null;
    if (!isIndex(session.groupIndex) || !isIndex(session.stepIndex) || !isIndex(session.selectedIdx)) return null;
    const draftPoints = stringMap(session.draftPoints);
    const feedbackDrafts = stringMap(session.feedbackDrafts);
    if (!draftPoints || !feedbackDrafts) return null;
    if (!Array.isArray(session.skipped) || !session.skipped.every((key) => typeof key === 'string')) return null;
    return {
        version: GRADE_QUEUE_SESSION_VERSION,
        savedAt: session.savedAt,
        view: session.view as GradeQueueSessionView,
        groupIndex: session.groupIndex,
        stepIndex: session.stepIndex,
        selectedIdx: session.selectedIdx,
        draftPoints,
        feedbackDrafts,
        skipped: session.skipped,
    };
}

export function serialiseGradeQueueSession(state: GradeQueueSessionState, now = Date.now()): string {
    return JSON.stringify({
        version: GRADE_QUEUE_SESSION_VERSION,
        savedAt: new Date(now).toISOString(),
        ...state,
    });
}

/** Drafts, skips or a moved cursor are all worth resuming; a pristine queue is not. */
export function hasSessionContent(state: GradeQueueSessionState): boolean {
    return (
        Object.keys(state.draftPoints).length > 0 ||
        Object.keys(state.feedbackDrafts).length > 0 ||
        state.skipped.length > 0 ||
        state.groupIndex > 0 ||
        state.stepIndex > 0 ||
        state.selectedIdx > 0
    );
}

/** null when nothing usable is stored or localStorage is unavailable (private mode, SSR). */
export function loadGradeQueueSession(key: string, now = Date.now()): GradeQueueSession | null {
    try {
        return parseGradeQueueSession(localStorage.getItem(key), now);
    } catch {
        return null;
    }
}

export function saveGradeQueueSession(key: string, state: GradeQueueSessionState, now = Date.now()): boolean {
    const raw = serialiseGradeQueueSession(state, now);
    if (raw.length > MAX_BYTES) return false;
    try {
        localStorage.setItem(key, raw);
        return true;
    } catch {
        return false;
    }
}

export function clearGradeQueueSession(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // Nothing to clear when storage is unavailable.
    }
}
