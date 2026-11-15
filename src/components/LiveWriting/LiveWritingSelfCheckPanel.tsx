import { useTranslation } from 'react-i18next';
import { CheckCircle } from 'lucide-react';
import type { LiveWritingSelfRating } from '../../types';
import { LIVE_WRITING_SELF_RATINGS, liveWritingSelfRatingKey } from '../../utils/liveWriting';

interface Props {
    savedRating?: LiveWritingSelfRating;
    selectedRating?: LiveWritingSelfRating;
    note: string;
    saving: boolean;
    failed: boolean;
    onRatingChange: (rating: LiveWritingSelfRating) => void;
    onNoteChange: (note: string) => void;
    onSubmit: () => void;
}

const EMOJI: Record<LiveWritingSelfRating, string> = {
    happy: '🙂',
    neutral: '😐',
    unhappy: '😕',
};

export default function LiveWritingSelfCheckPanel({
    savedRating,
    selectedRating,
    note,
    saving,
    failed,
    onRatingChange,
    onNoteChange,
    onSubmit,
}: Props) {
    const { t } = useTranslation();

    if (savedRating) {
        return (
            <section className="card" style={{ padding: 20 }} aria-labelledby="live-selfcheck-title">
                <h2 id="live-selfcheck-title" className="item-heading" style={{ margin: '0 0 6px' }}>
                    {t('liveWriting.student_selfcheck_title')}
                </h2>
                <div
                    role="status"
                    style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        marginTop: 12,
                        padding: '12px 14px',
                        borderRadius: 10,
                        background: 'var(--green-soft, color-mix(in srgb, var(--green) 14%, transparent))',
                        border: '1px solid var(--green-border, var(--green))',
                    }}
                >
                    <CheckCircle size={18} style={{ color: 'var(--green-text)', flexShrink: 0, marginTop: 2 }} />
                    <div>
                        <strong>
                            {EMOJI[savedRating]} {t(liveWritingSelfRatingKey(savedRating))}
                        </strong>
                        <p className="text-muted text-xs" style={{ margin: '4px 0 0' }}>
                            {t('liveWriting.student_selfcheck_saved')}
                        </p>
                        {note && <p style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>{note}</p>}
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="card" style={{ padding: 20 }} aria-labelledby="live-selfcheck-title">
            <h2 id="live-selfcheck-title" className="item-heading" style={{ margin: '0 0 6px' }}>
                {t('liveWriting.student_selfcheck_title')}
            </h2>
            <p className="text-muted" style={{ margin: '0 0 16px' }}>
                {t('liveWriting.student_selfcheck_intro')}
            </p>
            <div
                role="group"
                aria-label={t('liveWriting.student_selfcheck_title')}
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: 10,
                }}
            >
                {LIVE_WRITING_SELF_RATINGS.map((option) => (
                    <button
                        key={option}
                        type="button"
                        className={`btn ${selectedRating === option ? 'btn-primary' : 'btn-ghost'}`}
                        aria-pressed={selectedRating === option}
                        onClick={() => onRatingChange(option)}
                        style={{
                            minHeight: 96,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            whiteSpace: 'normal',
                            lineHeight: 1.3,
                        }}
                    >
                        <span aria-hidden="true" style={{ fontSize: 30 }}>
                            {EMOJI[option]}
                        </span>
                        <span>{t(liveWritingSelfRatingKey(option))}</span>
                    </button>
                ))}
            </div>

            <label htmlFor="live-selfcheck-note" style={{ display: 'block', margin: '18px 0 6px' }}>
                {t('liveWriting.student_selfcheck_note')}
            </label>
            <input
                id="live-selfcheck-note"
                className="input"
                value={note}
                maxLength={240}
                placeholder={t('liveWriting.student_selfcheck_note_placeholder')}
                onChange={(event) => onNoteChange(event.target.value)}
            />

            {failed && (
                <p className="text-muted" role="alert" style={{ margin: '10px 0 0' }}>
                    {t('liveWriting.student_selfcheck_failed')}
                </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!selectedRating || saving}
                    onClick={onSubmit}
                >
                    {saving ? t('liveWriting.student_selfcheck_saving') : t('liveWriting.student_selfcheck_submit')}
                </button>
            </div>
        </section>
    );
}
