import type { AuditRow } from '../types';

const scalar = (v: unknown): string =>
    v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);

/** One-line, human-readable summary of an audit entry's details, e.g. "role: user → teacher; profile_id: …". */
export function formatAuditDetails(details: AuditRow['details']): string {
    if (!details) return '';
    return Object.entries(details)
        .map(([key, value]) => {
            if (value && typeof value === 'object' && !Array.isArray(value) && ('from' in value || 'to' in value)) {
                const change = value as { from?: unknown; to?: unknown };
                return `${key}: ${scalar(change.from)} → ${scalar(change.to)}`;
            }
            if (key === 'from' || key === 'to') return '';
            return `${key}: ${scalar(value)}`;
        })
        .concat('from' in details || 'to' in details ? [`${scalar(details.from)} → ${scalar(details.to)}`] : [])
        .filter(Boolean)
        .join('; ');
}

/** Who performed the action: display name, else email, else null (system / deleted account). */
export function auditActorLabel(row: Pick<AuditRow, 'actor' | 'actor_id'>): string | null {
    return row.actor?.display_name || row.actor?.email || null;
}
