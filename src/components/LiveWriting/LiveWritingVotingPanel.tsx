import { useTranslation } from 'react-i18next';
import { Lock, RefreshCw, Sparkles, Unlock } from 'lucide-react';
import type { LiveWritingRoundLogEntry, LiveWritingVoteResult } from '../../types';
import { liveWritingSelfRatingKey } from '../../utils/liveWriting';

interface Props {
    roundIndex: number;
    votesOpen: boolean;
    results: LiveWritingVoteResult[];
    log: LiveWritingRoundLogEntry[];
    busy: boolean;
    failed: boolean;
    onCloseVoting: () => void;
    onReopenVoting: () => void;
    onShowFinals: () => void;
}

function logKey(action: LiveWritingRoundLogEntry['action']): string {
    return `liveWriting.voting_log_${action}`;
}

export default function LiveWritingVotingPanel({
    roundIndex,
    votesOpen,
    results,
    log,
    busy,
    failed,
    onCloseVoting,
    onReopenVoting,
    onShowFinals,
}: Props) {
    const { t } = useTranslation();
    const selfChecks = results.filter((row) => row.selfRating).length;
    const votes = results.filter((row) => row.votedForParticipantId).length;

    return (
        <section className="card" style={{ padding: 24 }} aria-labelledby="live-voting-title">
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 16,
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                }}
            >
                <div>
                    <h2 id="live-voting-title" className="item-heading" style={{ margin: 0 }}>
                        {t('liveWriting.voting_title', { round: roundIndex })}
                    </h2>
                    <p className="text-muted text-xs" style={{ margin: '5px 0 0' }}>
                        {t('liveWriting.voting_summary', { selfChecks, votes, total: results.length })}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {votesOpen ? (
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onCloseVoting}>
                            <Lock size={15} /> {t('liveWriting.voting_close')}
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={busy}
                            onClick={() => {
                                if (window.confirm(t('liveWriting.voting_reopen_confirm'))) onReopenVoting();
                            }}
                        >
                            <RefreshCw size={15} /> {t('liveWriting.voting_reopen')}
                        </button>
                    )}
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onShowFinals}>
                        <Sparkles size={15} /> {t('liveWriting.voting_show_finals')}
                    </button>
                    {votesOpen ? <Unlock size={16} className="text-muted" aria-hidden="true" /> : null}
                </div>
            </div>

            {failed && (
                <p className="text-muted" role="alert" style={{ margin: '12px 0 0' }}>
                    {t('liveWriting.voting_load_failed')}
                </p>
            )}

            {results.length === 0 ? (
                <p className="text-muted" style={{ margin: '16px 0 0' }}>
                    {t('liveWriting.voting_no_results')}
                </p>
            ) : (
                <div style={{ overflowX: 'auto', marginTop: 16 }}>
                    <table className="table" style={{ width: '100%', minWidth: 620 }}>
                        <thead>
                            <tr>
                                <th scope="col">{t('liveWriting.voting_student')}</th>
                                <th scope="col">{t('liveWriting.voting_self_check')}</th>
                                <th scope="col">{t('liveWriting.voting_received')}</th>
                                <th scope="col">{t('liveWriting.voting_voted_for')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((row) => (
                                <tr key={row.participantId}>
                                    <td>{row.displayName}</td>
                                    <td>
                                        {row.selfRating ? (
                                            <div>
                                                <span>{t(liveWritingSelfRatingKey(row.selfRating))}</span>
                                                {row.selfNote && (
                                                    <span className="text-muted text-xs" style={{ display: 'block' }}>
                                                        {row.selfNote}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-muted">—</span>
                                        )}
                                    </td>
                                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{row.votesReceived}</td>
                                    <td>
                                        {row.votedForName ?? <span className="text-muted">—</span>}
                                        {!row.hasPair && (
                                            <span className="text-muted text-xs" style={{ display: 'block' }}>
                                                {t('liveWriting.voting_no_pair')}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div style={{ marginTop: 22 }}>
                <h3 className="item-heading" style={{ fontSize: '0.95rem', marginBottom: 8 }}>
                    {t('liveWriting.voting_log_title')}
                </h3>
                {log.length === 0 ? (
                    <p className="text-muted text-xs" style={{ margin: 0 }}>
                        {t('liveWriting.voting_log_empty')}
                    </p>
                ) : (
                    <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
                        {log.map((entry) => (
                            <li key={entry.id} className="text-muted" style={{ fontSize: '0.85rem' }}>
                                {t(logKey(entry.action))} ·{' '}
                                {new Date(entry.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </section>
    );
}
