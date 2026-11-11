import { useTranslation } from 'react-i18next';
import { CheckCircle, Clock } from 'lucide-react';
import type {
    LiveWritingSelfRating,
    LiveWritingStudentState,
    LiveWritingVoteChoice,
    LiveWritingVoteState,
} from '../../types';
import LiveWritingPeerVotePanel from './LiveWritingPeerVotePanel';
import LiveWritingSelfCheckPanel from './LiveWritingSelfCheckPanel';

interface Props {
    state: LiveWritingStudentState;
    voteState: LiveWritingVoteState | null;
    selfRating?: LiveWritingSelfRating;
    selfChoice?: LiveWritingSelfRating;
    selfNote: string;
    selfSaving: boolean;
    selfFailed: boolean;
    voteSaving: boolean;
    voteFailed: boolean;
    onSelfRatingChange: (rating: LiveWritingSelfRating) => void;
    onSelfNoteChange: (note: string) => void;
    onSelfSubmit: () => void;
    onVote: (choice: LiveWritingVoteChoice) => void;
}

export default function LiveWritingFinishedPanel({
    state,
    voteState,
    selfRating,
    selfChoice,
    selfNote,
    selfSaving,
    selfFailed,
    voteSaving,
    voteFailed,
    onSelfRatingChange,
    onSelfNoteChange,
    onSelfSubmit,
    onVote,
}: Props) {
    const { t } = useTranslation();
    const handedIn = Boolean(state.handedInAt);

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            {handedIn ? (
                <div
                    style={{
                        display: 'flex',
                        gap: 12,
                        alignItems: 'flex-start',
                        background: 'var(--green-soft, color-mix(in srgb, var(--green) 14%, transparent))',
                        border: '1px solid var(--green-border, var(--green))',
                        borderRadius: 12,
                        padding: '14px 16px',
                    }}
                    role="status"
                >
                    <CheckCircle size={20} style={{ color: 'var(--green-text)', flexShrink: 0, marginTop: 2 }} />
                    <div>
                        <strong>{t('liveWriting.student_handed_in_title')}</strong>
                        <p style={{ margin: '4px 0 0', fontSize: '0.9rem' }}>
                            {t('liveWriting.student_handed_in_desc')}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="card" role="status" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <Clock size={20} />
                        <strong>{t('liveWriting.student_time_up')}</strong>
                    </div>
                    <p className="text-muted" style={{ margin: '8px 0 0' }}>
                        {state.status === 'finals'
                            ? t('liveWriting.student_finals_waiting')
                            : t('liveWriting.student_waiting_after_handin')}
                    </p>
                </div>
            )}

            {handedIn && (
                <LiveWritingSelfCheckPanel
                    savedRating={selfRating}
                    selectedRating={selfChoice}
                    note={selfNote}
                    saving={selfSaving}
                    failed={selfFailed}
                    onRatingChange={onSelfRatingChange}
                    onNoteChange={onSelfNoteChange}
                    onSubmit={onSelfSubmit}
                />
            )}

            {handedIn &&
                state.status === 'voting' &&
                state.peerVoting &&
                (selfRating ? (
                    <LiveWritingPeerVotePanel
                        optionA={
                            voteState?.hasPair
                                ? { html: voteState.optionAHtml ?? '', wordCount: voteState.optionAWordCount }
                                : undefined
                        }
                        optionB={
                            voteState?.hasPair
                                ? { html: voteState.optionBHtml ?? '', wordCount: voteState.optionBWordCount }
                                : undefined
                        }
                        hasPair={Boolean(voteState?.hasPair)}
                        voted={Boolean(voteState?.voted)}
                        votesOpen={Boolean(voteState?.votesOpen)}
                        saving={voteSaving}
                        failed={voteFailed}
                        onVote={onVote}
                    />
                ) : (
                    <div className="card" style={{ padding: 20 }}>
                        <p className="text-muted" style={{ margin: 0 }}>
                            {t('liveWriting.student_vote_after_selfcheck')}
                        </p>
                    </div>
                ))}

            {handedIn && state.status === 'writing' && (
                <div className="card" style={{ padding: 20 }}>
                    <p className="text-muted" style={{ margin: 0 }}>
                        {t('liveWriting.student_waiting_after_handin')}
                    </p>
                </div>
            )}

            {handedIn && state.status === 'finals' && (
                <div className="card" style={{ padding: 20 }}>
                    <p className="text-muted" style={{ margin: 0 }}>
                        {t('liveWriting.student_finals_waiting')}
                    </p>
                </div>
            )}

            {!handedIn && (
                <div className="card" style={{ padding: 20 }}>
                    <p className="text-muted" style={{ margin: 0 }}>
                        {t('liveWriting.student_not_handed_in')}
                    </p>
                </div>
            )}
        </div>
    );
}
