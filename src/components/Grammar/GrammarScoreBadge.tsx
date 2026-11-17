import React from 'react';
import { useTranslation } from 'react-i18next';
import { grammarStatus, type GrammarStatus } from '../../utils/grammarStandardAggregator';

const GRAMMAR_STATUS_COLOR: Record<GrammarStatus, string> = {
    secure: 'var(--green-text)',
    developing: 'var(--yellow-text)',
    'needs-work': 'var(--red-text)',
    'no-evidence': 'var(--text-dim)',
};

const BADGE_CLASS: Record<GrammarStatus, string> = {
    secure: 'badge badge-green',
    developing: 'badge badge-yellow',
    'needs-work': 'badge badge-red',
    'no-evidence': 'badge',
};

function grammarStatusLabelKey(status: GrammarStatus): string {
    return `grammarOverview.status_${status.replace('-', '_')}`;
}

/** A 0–100 score as the app's green / yellow / red badge, or a dash when there is no evidence. */
export function GrammarScoreBadge({
    pct,
    suffix = true,
    unit = '%',
}: {
    pct: number | null;
    suffix?: boolean;
    unit?: string;
}) {
    if (pct === null) {
        return (
            <span className="badge" style={{ color: 'var(--text-dim)' }}>
                —
            </span>
        );
    }
    return (
        <span className={BADGE_CLASS[grammarStatus(pct)]}>
            {Math.round(pct)}
            {suffix ? unit : ''}
        </span>
    );
}

export function GrammarStatusText({ status }: { status: GrammarStatus }) {
    const { t } = useTranslation();
    return (
        <span
            style={{
                fontSize: '0.72rem',
                fontWeight: status === 'no-evidence' ? 500 : 750,
                textTransform: status === 'no-evidence' ? 'none' : 'uppercase',
                letterSpacing: '0.02em',
                color: GRAMMAR_STATUS_COLOR[status],
            }}
        >
            {t(grammarStatusLabelKey(status))}
        </span>
    );
}

export function GrammarAccuracyBar({ pct }: { pct: number | null }) {
    const status = grammarStatus(pct);
    const tone = status === 'secure' ? '' : status === 'developing' ? ' mid' : ' low';
    return (
        <div className={`bar${tone}`} aria-hidden="true">
            <span style={{ width: `${pct ?? 0}%` }} />
        </div>
    );
}
