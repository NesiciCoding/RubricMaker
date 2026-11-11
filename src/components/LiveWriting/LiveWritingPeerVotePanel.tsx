import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LiveWritingVoteChoice } from '../../types';

interface VoteOption {
    html: string;
    wordCount: number;
}

interface Props {
    optionA?: VoteOption;
    optionB?: VoteOption;
    hasPair: boolean;
    voted: boolean;
    votesOpen: boolean;
    saving: boolean;
    failed: boolean;
    onVote: (choice: LiveWritingVoteChoice) => void;
}

export default function LiveWritingPeerVotePanel({
    optionA,
    optionB,
    hasPair,
    voted,
    votesOpen,
    saving,
    failed,
    onVote,
}: Props) {
    const { t } = useTranslation();
    const cleanA = useMemo(() => DOMPurify.sanitize(optionA?.html ?? ''), [optionA?.html]);
    const cleanB = useMemo(() => DOMPurify.sanitize(optionB?.html ?? ''), [optionB?.html]);

    if (voted) {
        return (
            <section className="card" style={{ padding: 20 }} aria-labelledby="live-vote-title">
                <h2 id="live-vote-title" className="item-heading" style={{ margin: '0 0 6px' }}>
                    {t('liveWriting.student_vote_title')}
                </h2>
                <div role="status" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12 }}>
                    <CheckCircle size={20} style={{ color: 'var(--green-text)', flexShrink: 0, marginTop: 2 }} />
                    <div>
                        <strong>{t('liveWriting.student_vote_thanks')}</strong>
                        <p className="text-muted" style={{ margin: '4px 0 0' }}>
                            {t('liveWriting.student_vote_thanks_desc')}
                        </p>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="card" style={{ padding: 20 }} aria-labelledby="live-vote-title">
            <h2 id="live-vote-title" className="item-heading" style={{ margin: '0 0 6px' }}>
                {t('liveWriting.student_vote_title')}
            </h2>
            <p className="text-muted" style={{ margin: '0 0 16px' }}>
                {t('liveWriting.student_vote_intro')}
            </p>

            {!votesOpen ? (
                <p className="text-muted">{t('liveWriting.student_vote_closed')}</p>
            ) : !hasPair || !optionA || !optionB ? (
                <p className="text-muted">{t('liveWriting.student_vote_waiting_pair')}</p>
            ) : (
                <>
                    <div className="live-vote-grid">
                        {(
                            [
                                {
                                    choice: 'a',
                                    label: t('liveWriting.student_vote_text_a'),
                                    option: optionA,
                                    clean: cleanA,
                                },
                                {
                                    choice: 'b',
                                    label: t('liveWriting.student_vote_text_b'),
                                    option: optionB,
                                    clean: cleanB,
                                },
                            ] as const
                        ).map(({ choice, label, option, clean }) => (
                            <article
                                key={choice}
                                className="card"
                                style={{ padding: 16, background: 'var(--bg-elevated)', minWidth: 0 }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                                    <strong>{label}</strong>
                                    <span className="text-muted text-xs">
                                        {t('liveWriting.student_vote_words', { count: option.wordCount })}
                                    </span>
                                </div>
                                <div
                                    className="live-vote-text tiptap-editor-content"
                                    dangerouslySetInnerHTML={{ __html: clean }}
                                />
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    disabled={saving}
                                    onClick={() => onVote(choice)}
                                    style={{ width: '100%', marginTop: 14 }}
                                >
                                    {saving
                                        ? t('liveWriting.student_vote_saving')
                                        : t('liveWriting.student_vote_choose')}
                                </button>
                            </article>
                        ))}
                    </div>
                    {failed && (
                        <p className="text-muted" role="alert" style={{ margin: '12px 0 0' }}>
                            {t('liveWriting.student_vote_failed')}
                        </p>
                    )}
                    <p className="text-muted text-xs" style={{ margin: '14px 0 0' }}>
                        {t('liveWriting.student_vote_privacy')}
                    </p>
                </>
            )}
        </section>
    );
}
